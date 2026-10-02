export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { getConnection } from "@/lib/solana";
import { checkGraduation, findVerifiedMigration } from "@/lib/launchpad/pump-curve-service";

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
 * While the record is not yet migrationVerified, this route also attempts
 * the more expensive real-migration-event search (findVerifiedMigration -
 * up to 15 getTransaction calls) exactly once per request, not per every
 * graduated-mint page view in general: once verified, the result latches
 * (migrationVerified stays true forever, the search never runs again for
 * this mint). A mint that graduated long enough ago for its migration
 * signature to have aged out of RPC history may never verify - reported
 * honestly via migrationVerified: false, never silently upgraded to true.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ mint: string }> }) {
  const limitCheck = await rateLimit(req, { limit: 60, window: 60, type: "launchpad-token-graduation" });
  if (!limitCheck.success) return limitCheck.response;

  const { mint } = await params;
  const check = await checkGraduation(getConnection(), mint);

  let event = null;
  if (check.graduated) {
    const existing = await prisma.graduationEvent.findUnique({ where: { mintAddress: mint } });

    let verified: Awaited<ReturnType<typeof findVerifiedMigration>> = null;
    if (!existing || !existing.migrationVerified) {
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
        }
      : {
          mintAddress: mint,
          bondingCurveAddress: check.bondingCurveAddress,
          poolAddress: check.poolAddress,
          signature: check.anchorSignature,
          slot: check.anchorSlot,
          blockTime: check.anchorBlockTime,
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
            }
          : // Not verified this time either - keep the pool address fresh
            // (it can take a moment to appear after `complete` flips)
            // without touching the signature/slot/blockTime fields an
            // earlier, already-verified write may have set.
            { poolAddress: check.poolAddress },
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
