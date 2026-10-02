export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { getConnection } from "@/lib/solana";
import { getCurveState } from "@/lib/launchpad/pump-curve-service";
import { getPumpSwapPoolState } from "@/lib/launchpad/pumpswap-pool-service";
import { readPoolLiquidity } from "@/lib/launchpad/pool-liquidity-reader";
import { indexFullHolderCount } from "@/lib/launchpad/full-holder-count-service";
import { getQuoteVolumeSince } from "@/lib/launchpad/volume-index-service";
import { bondingCurvePda } from "@/lib/launchpad/pump-curve-keys";
import { PublicKey } from "@solana/web3.js";
import { CREATE_CPMM_POOL_AUTH } from "@raydium-io/raydium-sdk-v2";

/*
 * Same CRON_SECRET auth as every other /api/cron/* route - fails CLOSED if
 * the env var is unset. Writes one real AnalyticsSnapshot row per mint per
 * run (never a row every few seconds - see this project's cron schedule
 * config for the actual interval, e.g. every 15 minutes) for every mint
 * ZRP has real indexed activity for: a launched token, an active pool, a
 * recorded bonding-curve trade, or a recorded graduation - exactly the
 * same "works for any token, not only ones ZRP itself launched" posture
 * pool-liquidity-reader.ts already documents. Every figure in the snapshot
 * is read live from chain or aggregated from already-verified TokenTrade/
 * TokenPool rows at write time - never fabricated, never interpolated.
 * Mints are processed sequentially to keep one run's RPC load bounded.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [launched, pools, curveTrades, graduations] = await Promise.all([
    prisma.launchedToken.findMany({ where: { status: "COMPLETED", mintAddress: { not: null } }, select: { mintAddress: true } }),
    prisma.tokenPool.findMany({ where: { status: "ACTIVE" }, select: { baseMint: true } }),
    prisma.tokenTrade.findMany({ where: { source: "BONDING_CURVE" }, distinct: ["mintAddress"], select: { mintAddress: true } }),
    prisma.graduationEvent.findMany({ select: { mintAddress: true } }),
  ]);

  const mints = new Set<string>();
  for (const t of launched) if (t.mintAddress) mints.add(t.mintAddress);
  for (const p of pools) mints.add(p.baseMint);
  for (const t of curveTrades) mints.add(t.mintAddress);
  for (const g of graduations) mints.add(g.mintAddress);

  const connection = getConnection();
  const takenAt = new Date();
  const results: Array<{ mintAddress: string; status: "OK" | "ERROR"; error?: string }> = [];

  for (const mintAddress of Array.from(mints)) {
    try {
      const lastSnapshot = await prisma.analyticsSnapshot.findFirst({
        where: { mintAddress },
        orderBy: { takenAt: "desc" },
        select: { takenAt: true },
      });
      const since = lastSnapshot?.takenAt ?? new Date(0);

      const [curve, activePools, volumeDelta, graduationRecord] = await Promise.all([
        getCurveState(connection, mintAddress),
        prisma.tokenPool.findMany({
          where: { status: "ACTIVE", OR: [{ baseMint: mintAddress }, { quoteMint: mintAddress }] },
          select: { baseVault: true, quoteVault: true, lpMint: true },
        }),
        getQuoteVolumeSince(mintAddress, since),
        prisma.graduationEvent.findUnique({ where: { mintAddress }, select: { poolAddress: true } }),
      ]);

      let liquidityTotalLamports = BigInt(0);
      let poolCount = activePools.length;
      for (const pool of activePools) {
        const snapshot = await readPoolLiquidity(connection, pool);
        // Only the SOL/USDC-quote side of liquidity is summed as
        // "liquidity in lamports" here - mixed-quote pools (a non-SOL,
        // non-USDC quote mint) are intentionally left out of this total
        // rather than summed in incompatible units; readPoolLiquidity's
        // own status already distinguishes "pool gone" from "zero".
        if (snapshot.status === "OK" && snapshot.reserveQuoteRaw) {
          liquidityTotalLamports += BigInt(snapshot.reserveQuoteRaw);
        }
      }

      // Post-graduation: the curve's own price/market-cap fields are
      // frozen at the migration moment (pump stops accepting buy/sell
      // once complete), so the real, live source for both is the
      // PumpSwap pool it migrated into - read and substituted here rather
      // than reporting a stale curve price as if it were current. Market
      // cap is recomputed from the pool's real effective price times the
      // curve's own (permanent, unchanging) tokenTotalSupply - never
      // guessed when either input is unavailable.
      let priceQuoteLamports = curve.status === "OK" ? curve.priceQuoteLamports : null;
      let priceTokenRaw = curve.status === "OK" ? curve.priceTokenRaw : null;
      let marketCapLamports = curve.status === "OK" ? curve.marketCapLamports : null;

      if (graduationRecord?.poolAddress) {
        const pumpSwapState = await getPumpSwapPoolState(connection, graduationRecord.poolAddress);
        if (pumpSwapState.status === "OK") {
          poolCount += 1;
          if (pumpSwapState.quoteReserveRaw) {
            liquidityTotalLamports += BigInt(pumpSwapState.quoteReserveRaw);
          }
          priceQuoteLamports = pumpSwapState.priceQuoteRaw;
          priceTokenRaw = pumpSwapState.priceBaseRaw;
          marketCapLamports =
            curve.status === "OK" && curve.tokenTotalSupplyRaw && pumpSwapState.priceQuoteRaw && pumpSwapState.priceBaseRaw
              ? ((BigInt(pumpSwapState.priceQuoteRaw) * BigInt(curve.tokenTotalSupplyRaw)) / BigInt(pumpSwapState.priceBaseRaw)).toString()
              : null;
        }
      }

      const curveAddress = bondingCurvePda(new PublicKey(mintAddress));
      const holderResult = await indexFullHolderCount(connection, mintAddress, {
        excludeOwners: [CREATE_CPMM_POOL_AUTH.toBase58(), curveAddress.toBase58()],
      });

      await prisma.analyticsSnapshot.upsert({
        where: { mintAddress_takenAt: { mintAddress, takenAt } },
        create: {
          mintAddress,
          takenAt,
          priceQuoteLamports,
          priceTokenRaw,
          marketCapLamports,
          curveProgressBps: curve.status === "OK" ? curve.progressBps : null,
          liquidityTotalLamports: liquidityTotalLamports.toString(),
          poolCount,
          holderCount: holderResult.status === "OK" ? holderResult.holderCount : null,
          buyVolumeLamports: volumeDelta.buyQuoteRaw,
          sellVolumeLamports: volumeDelta.sellQuoteRaw,
          tradeCount: volumeDelta.tradeCount,
        },
        update: {},
      });

      results.push({ mintAddress, status: "OK" });
    } catch (error: unknown) {
      results.push({ mintAddress, status: "ERROR", error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  return NextResponse.json({ snapshotted: results.length, results });
}
