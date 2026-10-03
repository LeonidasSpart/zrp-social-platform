export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { getConnection } from "@/lib/solana";
import { checkGraduation, findVerifiedMigration, MIGRATION_SEARCH_COOLDOWN_MS } from "@/lib/launchpad/pump-curve-service";
import { checkZrpGraduation, findZrpGraduateEvent } from "@/lib/launchpad/zrp-launch-service";

/*
 * Real graduation detection - re-reads the bonding curve's own `complete`
 * flag live on every call (see pump-curve-service.checkGraduation), never
 * a stale DB row on its own. The first request to observe `graduated:
 * true` for a mint persists a GraduationEvent (upserted on mintAddress,
 * which is unique and can graduate at most once) so later reads and the
 * discovery "Graduated" filter have an indexed record to query instead of
 * re-deriving graduation state from scratch everywhere - the record is
 * only ever written from this independently-verified on-chain read, never
 * from a client claim.
 *
 * While the record is not yet migrationVerified, this route attempts the
 * more expensive real-migration-event search (findVerifiedMigration - a
 * bounded, paginated search, see its own doc comment) at most once per
 * MIGRATION_SEARCH_COOLDOWN_MS per mint, gated by lastMigrationSearchAt -
 * not on every graduated-mint page view, which a popular still-unverified
 * token would otherwise turn into one full search per viewer per visit.
 * Once verified, the result latches (migrationVerified stays true forever,
 * the search never runs again for this mint). A mint that graduated long
 * enough ago for its migration signature to have aged out of RPC history
 * may never verify - reported honestly via migrationVerified: false, never
 * silently upgraded to true.
 */
/*
 * ZRP-native graduation is fully deterministic (BondingCurve.complete/
 * migrated read directly, see checkZrpGraduation) - no heuristic "last
 * activity" fallback is ever needed to know WHETHER a curve graduated,
 * only (rarely) to find the exact GraduateEvent signature when
 * `graduate()` was called out-of-band (it is permissionless) rather than
 * through this app's own flow. Still gated by the same
 * MIGRATION_SEARCH_COOLDOWN_MS as the pump path, for the same reason: a
 * popular, still-unrecorded graduated token must not re-trigger a bounded
 * signature search on every page view.
 */
async function handleZrpGraduation(mint: string) {
  const check = await checkZrpGraduation(getConnection(), mint);
  if (!check.migrated) {
    return { graduated: check.graduated, bondingCurveAddress: check.bondingCurveAddress, poolAddress: null, poolAccountExists: false, record: null };
  }

  const existing = await prisma.graduationEvent.findUnique({ where: { mintAddress: mint } });
  const cooledDown =
    !existing?.lastMigrationSearchAt || Date.now() - existing.lastMigrationSearchAt.getTime() >= MIGRATION_SEARCH_COOLDOWN_MS;
  const shouldSearch = (!existing || !existing.migrationVerified) && cooledDown;

  let verified: Awaited<ReturnType<typeof findZrpGraduateEvent>> = null;
  if (shouldSearch) {
    try {
      verified = await findZrpGraduateEvent(getConnection(), mint);
    } catch (err) {
      console.error("ZRP verified-migration search error:", err);
    }
  }

  const writeData = {
    mintAddress: mint,
    bondingCurveAddress: check.bondingCurveAddress,
    poolAddress: null, // populated once the ZRP-managed Raydium CPMM pool-service creates the post-graduation pool
    signature: verified?.signature ?? null,
    slot: verified?.slot ?? null,
    blockTime: verified?.blockTime ?? null,
    migrationVerified: !!verified,
    mintAmountRaw: verified?.realTokenReservesMigratedRaw ?? null,
    solAmountLamports: verified?.realSolReservesMigratedLamports ?? null,
    poolMigrationFeeLamports: null,
    lastMigrationSearchAt: shouldSearch ? new Date() : null,
  };

  let event;
  try {
    event = await prisma.graduationEvent.upsert({
      where: { mintAddress: mint },
      create: writeData,
      update: verified
        ? {
            signature: verified.signature,
            slot: verified.slot,
            blockTime: verified.blockTime,
            migrationVerified: true,
            mintAmountRaw: verified.realTokenReservesMigratedRaw,
            solAmountLamports: verified.realSolReservesMigratedLamports,
            lastMigrationSearchAt: new Date(),
          }
        : shouldSearch
          ? { lastMigrationSearchAt: new Date() }
          : {},
    });
  } catch (err: any) {
    if (err?.code === "P2002") {
      event = await prisma.graduationEvent.findUnique({ where: { mintAddress: mint } });
    } else {
      console.error("ZRP graduation event upsert error:", err);
      event = null;
    }
  }

  // poolAddress/poolAccountExists stay false until a follow-up phase wires
  // ZRP's existing Raydium CPMM pool-service (src/lib/launchpad/
  // pool-service.ts) to actually seed post-graduation liquidity from the
  // swept reserves this GraduateEvent reports - not fabricated here.
  return { graduated: true, bondingCurveAddress: check.bondingCurveAddress, poolAddress: null, poolAccountExists: false, record: event };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ mint: string }> }) {
  const limitCheck = await rateLimit(req, { limit: 60, window: 60, type: "launchpad-token-graduation" });
  if (!limitCheck.success) return limitCheck.response;

  const { mint } = await params;

  const launchedToken = await prisma.launchedToken.findUnique({ where: { mintAddress: mint }, select: { venue: true } });
  if (launchedToken?.venue === "ZRP_LAUNCH") {
    return NextResponse.json(await handleZrpGraduation(mint));
  }

  const check = await checkGraduation(getConnection(), mint);

  let event = null;
  if (check.graduated) {
    const existing = await prisma.graduationEvent.findUnique({ where: { mintAddress: mint } });

    const cooledDown =
      !existing?.lastMigrationSearchAt || Date.now() - existing.lastMigrationSearchAt.getTime() >= MIGRATION_SEARCH_COOLDOWN_MS;
    const shouldSearch = (!existing || !existing.migrationVerified) && cooledDown;

    let verified: Awaited<ReturnType<typeof findVerifiedMigration>> = null;
    if (shouldSearch) {
      try {
        verified = await findVerifiedMigration(getConnection(), mint);
      } catch (err) {
        console.error("Verified-migration search error:", err);
      }
    }

    const writeData = verified
      ? {
          mintAddress: mint,
          bondingCurveAddress: check.bondingCurveAddress,
          poolAddress: verified.poolAddress,
          signature: verified.signature,
          slot: verified.slot,
          blockTime: verified.blockTime,
          migrationVerified: true,
          mintAmountRaw: verified.mintAmountRaw,
          solAmountLamports: verified.solAmountLamports,
          poolMigrationFeeLamports: verified.poolMigrationFeeLamports,
          lastMigrationSearchAt: new Date(),
        }
      : {
          mintAddress: mint,
          bondingCurveAddress: check.bondingCurveAddress,
          poolAddress: check.poolAddress,
          signature: check.anchorSignature,
          slot: check.anchorSlot,
          blockTime: check.anchorBlockTime,
          lastMigrationSearchAt: shouldSearch ? new Date() : null,
        };

    try {
      event = await prisma.graduationEvent.upsert({
        where: { mintAddress: mint },
        create: writeData,
        update: verified
          ? {
              poolAddress: verified.poolAddress,
              signature: verified.signature,
              slot: verified.slot,
              blockTime: verified.blockTime,
              migrationVerified: true,
              mintAmountRaw: verified.mintAmountRaw,
              solAmountLamports: verified.solAmountLamports,
              poolMigrationFeeLamports: verified.poolMigrationFeeLamports,
              lastMigrationSearchAt: new Date(),
            }
          : // Not verified this time either (or skipped via cooldown) - keep
            // the pool address fresh (it can take a moment to appear after
            // `complete` flips) without touching the signature/slot/
            // blockTime fields an earlier, already-verified write may have
            // set. Only stamp lastMigrationSearchAt when a search actually
            // ran this request, so the cooldown window is measured from the
            // real attempt, not from every cheap page view.
            { poolAddress: check.poolAddress, ...(shouldSearch ? { lastMigrationSearchAt: new Date() } : {}) },
      });
    } catch (err: any) {
      // A concurrent request already upserted this mint, or the anchor
      // signature collided with another mint's record (astronomically
      // unlikely, but handled rather than 500ing) - fall back to reading
      // whatever is there instead of failing the whole response.
      if (err?.code === "P2002") {
        event = await prisma.graduationEvent.findUnique({ where: { mintAddress: mint } });
      } else {
        console.error("Graduation event upsert error:", err);
      }
    }
  } else {
    event = await prisma.graduationEvent.findUnique({ where: { mintAddress: mint } });
  }

  return NextResponse.json({ ...check, record: event });
}
