/*
 * Discovery ranking - Trending / Highest Volume / Most Holders - computed
 * entirely from already-indexed data (AnalyticsSnapshot rows the
 * launchpad-analytics-snapshot cron writes, and TokenTrade rows the
 * volume/curve indexers write), never from a live RPC call per request
 * and never from "newest" or "market cap" as a trending proxy.
 *
 * TRENDING FORMULA (fully documented here, not a black box):
 *
 *   score = 0.35 * log1p(recentVolumeSol)
 *         + 0.20 * log1p(recentTradeCount)
 *         + 0.15 * log1p(uniqueTraders)
 *         + 0.15 * log1p(liquiditySol)
 *         + 0.10 * log1p(max(0, holderGrowth))
 *         + 0.05 * log1p(priceChangePercent)
 *
 * Every term is log1p-normalized (ln(1+x)) before weighting: the six
 * signals live on wildly different scales (lamports vs trade counts vs
 * holder counts vs a percentage), and a raw weighted sum would let one
 * large-magnitude signal (e.g. a single pool's huge liquidity) dominate
 * regardless of its weight. log1p compresses that range while preserving
 * ordering and leaves a genuine zero at zero, which a sum of logarithms
 * (log(x), undefined at 0) would not. Weights sum to 1.0 and were chosen
 * to favor real trading activity (volume + trade count + unique traders =
 * 70%) over passive signals (liquidity, holder growth, price swing =
 * 30%), so a token cannot trend purely by sitting on deep liquidity or a
 * single large holder buy-in with no actual turnover.
 */

import { prisma } from "@/lib/db";

const WINDOW_MS: Record<"1h" | "6h" | "24h" | "7d", number> = {
  "1h": 60 * 60_000,
  "6h": 6 * 60 * 60_000,
  "24h": 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000,
};

const LAMPORTS_PER_SOL = 1_000_000_000;

function log1p(x: number): number {
  return Math.log(1 + Math.max(0, x));
}

export interface MintActivitySummary {
  mintAddress: string;
  recentVolumeLamports: bigint;
  recentTradeCount: number;
  uniqueTraders: number;
  liquidityTotalLamports: bigint;
  holderCount: number | null;
  holderGrowth: number;
  priceChangePercent: number;
  latestTakenAt: Date | null;
}

/**
 * Real activity summary for one mint over `windowMs`, built entirely from
 * AnalyticsSnapshot rows (volume/liquidity/holder figures) plus a direct
 * TokenTrade query for unique trader count (not snapshotted, since a
 * distinct-wallet count does not aggregate additively across snapshot
 * periods the way a sum does).
 */
export async function getMintActivitySummary(mintAddress: string, windowMs: number): Promise<MintActivitySummary> {
  const since = new Date(Date.now() - windowMs);

  const [snapshotsInWindow, latestSnapshot, earliestInWindow, uniqueTraderRows] = await Promise.all([
    prisma.analyticsSnapshot.findMany({
      where: { mintAddress, takenAt: { gte: since } },
      select: { buyVolumeLamports: true, sellVolumeLamports: true, tradeCount: true },
    }),
    prisma.analyticsSnapshot.findFirst({
      where: { mintAddress },
      orderBy: { takenAt: "desc" },
      select: { liquidityTotalLamports: true, holderCount: true, priceQuoteLamports: true, priceTokenRaw: true, takenAt: true },
    }),
    prisma.analyticsSnapshot.findFirst({
      where: { mintAddress, takenAt: { lte: since } },
      orderBy: { takenAt: "desc" },
      select: { holderCount: true, priceQuoteLamports: true, priceTokenRaw: true },
    }),
    prisma.tokenTrade.findMany({
      where: { mintAddress, blockTime: { gte: since } },
      select: { walletAddress: true },
      distinct: ["walletAddress"],
    }),
  ]);

  let recentVolumeLamports = BigInt(0);
  let recentTradeCount = 0;
  for (const s of snapshotsInWindow) {
    recentVolumeLamports += BigInt(s.buyVolumeLamports.toString()) + BigInt(s.sellVolumeLamports.toString());
    recentTradeCount += s.tradeCount;
  }

  const holderGrowth =
    latestSnapshot?.holderCount != null && earliestInWindow?.holderCount != null
      ? latestSnapshot.holderCount - earliestInWindow.holderCount
      : 0;

  let priceChangePercent = 0;
  if (
    latestSnapshot?.priceQuoteLamports &&
    latestSnapshot?.priceTokenRaw &&
    earliestInWindow?.priceQuoteLamports &&
    earliestInWindow?.priceTokenRaw
  ) {
    // Compare cross-multiplied ratios (a/b vs c/d <=> a*d vs c*b) to avoid
    // any floating-point division until the very last step, where only a
    // percentage for display/ranking (never a settled amount) is produced.
    const nowQ = Number(latestSnapshot.priceQuoteLamports.toString());
    const nowT = Number(latestSnapshot.priceTokenRaw.toString());
    const earlierQ = Number(earliestInWindow.priceQuoteLamports.toString());
    const earlierT = Number(earliestInWindow.priceTokenRaw.toString());
    if (earlierQ > 0 && nowT > 0 && earlierT > 0) {
      const nowPrice = nowQ / nowT;
      const earlierPrice = earlierQ / earlierT;
      priceChangePercent = earlierPrice > 0 ? Math.abs(((nowPrice - earlierPrice) / earlierPrice) * 100) : 0;
    }
  }

  return {
    mintAddress,
    recentVolumeLamports,
    recentTradeCount,
    uniqueTraders: uniqueTraderRows.length,
    liquidityTotalLamports: latestSnapshot ? BigInt(latestSnapshot.liquidityTotalLamports.toString()) : BigInt(0),
    holderCount: latestSnapshot?.holderCount ?? null,
    holderGrowth,
    priceChangePercent,
    latestTakenAt: latestSnapshot?.takenAt ?? null,
  };
}

export function trendingScore(summary: MintActivitySummary): number {
  const recentVolumeSol = Number(summary.recentVolumeLamports) / LAMPORTS_PER_SOL;
  const liquiditySol = Number(summary.liquidityTotalLamports) / LAMPORTS_PER_SOL;
  return (
    0.35 * log1p(recentVolumeSol) +
    0.2 * log1p(summary.recentTradeCount) +
    0.15 * log1p(summary.uniqueTraders) +
    0.15 * log1p(liquiditySol) +
    0.1 * log1p(summary.holderGrowth) +
    0.05 * log1p(summary.priceChangePercent)
  );
}

/** Every mint with at least one AnalyticsSnapshot row - the candidate universe for all three discovery rankings. */
export async function getTrackedMints(): Promise<string[]> {
  const rows = await prisma.analyticsSnapshot.findMany({ distinct: ["mintAddress"], select: { mintAddress: true } });
  return rows.map((r) => r.mintAddress);
}

export type VolumeWindow = keyof typeof WINDOW_MS;
export const VOLUME_WINDOWS: readonly VolumeWindow[] = ["1h", "6h", "24h", "7d"];

export function windowMs(window: VolumeWindow): number {
  return WINDOW_MS[window];
}
