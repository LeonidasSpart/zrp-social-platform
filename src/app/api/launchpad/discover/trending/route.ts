export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { getTrackedMints, getMintActivitySummary, trendingScore, windowMs } from "@/lib/launchpad/discovery-ranking";

/*
 * Real trending ranking - see discovery-ranking.ts for the fully
 * documented, non-black-box formula. Computed from indexed
 * AnalyticsSnapshot/TokenTrade data only (never a live RPC call per
 * request), over the trailing 6-hour activity window. Works for any mint
 * ZRP has indexed activity for, not only ones launched through ZRP's own
 * LaunchedToken registry - a token not in that registry is still returned
 * with its mint address and stats, just without ZRP-hosted name/image
 * metadata.
 */
const TRENDING_WINDOW_MS = windowMs("6h");

export async function GET(req: NextRequest) {
  const limitCheck = await rateLimit(req, { limit: 30, window: 60, type: "launchpad-discover-trending" });
  if (!limitCheck.success) return limitCheck.response;

  const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(1, limitParam), 50) : 20;

  const mints = await getTrackedMints();
  const summaries = await Promise.all(mints.map((mint) => getMintActivitySummary(mint, TRENDING_WINDOW_MS)));

  const ranked = summaries
    .map((summary) => ({ summary, score: trendingScore(summary) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const launchedTokens = await prisma.launchedToken.findMany({
    where: { mintAddress: { in: ranked.map((r) => r.summary.mintAddress) } },
    select: { mintAddress: true, name: true, symbol: true, imageUrl: true },
  });
  const byMint = new Map(launchedTokens.map((t) => [t.mintAddress as string, t]));

  return NextResponse.json({
    windowLabel: "6h",
    tokens: ranked.map(({ summary, score }) => ({
      mintAddress: summary.mintAddress,
      launchedToken: byMint.get(summary.mintAddress) ?? null,
      trendingScore: score,
      recentVolumeLamports: summary.recentVolumeLamports.toString(),
      recentTradeCount: summary.recentTradeCount,
      uniqueTraders: summary.uniqueTraders,
      liquidityTotalLamports: summary.liquidityTotalLamports.toString(),
      holderCount: summary.holderCount,
      holderGrowth: summary.holderGrowth,
      priceChangePercent: summary.priceChangePercent,
    })),
  });
}
