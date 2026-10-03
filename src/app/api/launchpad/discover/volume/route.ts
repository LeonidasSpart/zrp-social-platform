export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { getTrackedMints, getMintActivitySummary, windowMs, VOLUME_WINDOWS, type VolumeWindow } from "@/lib/launchpad/discovery-ranking";

/*
 * Highest-volume ranking: sorts by real indexed trading volume (buy+sell
 * lamports from TokenTrade, via AnalyticsSnapshot deltas) over the
 * requested window - never transfer counts, never a live RPC call per
 * request. ?window=1h|6h|24h|7d, default 24h.
 */
export async function GET(req: NextRequest) {
  const limitCheck = await rateLimit(req, { limit: 30, window: 60, type: "launchpad-discover-volume" });
  if (!limitCheck.success) return limitCheck.response;

  const windowParam = (req.nextUrl.searchParams.get("window") ?? "24h") as VolumeWindow;
  if (!VOLUME_WINDOWS.includes(windowParam)) {
    return NextResponse.json({ error: "window must be one of 1h, 6h, 24h, 7d." }, { status: 400 });
  }
  const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(1, limitParam), 50) : 20;

  const mints = await getTrackedMints();
  const summaries = await Promise.all(mints.map((mint) => getMintActivitySummary(mint, windowMs(windowParam))));

  const ranked = summaries
    .filter((s) => s.recentVolumeLamports > BigInt(0))
    .sort((a, b) => (a.recentVolumeLamports < b.recentVolumeLamports ? 1 : a.recentVolumeLamports > b.recentVolumeLamports ? -1 : 0))
    .slice(0, limit);

  const launchedTokens = await prisma.launchedToken.findMany({
    where: { mintAddress: { in: ranked.map((r) => r.mintAddress) } },
    select: { mintAddress: true, name: true, symbol: true, imageUrl: true },
  });
  const byMint = new Map(launchedTokens.map((t) => [t.mintAddress as string, t]));

  return NextResponse.json({
    windowLabel: windowParam,
    tokens: ranked.map((summary) => ({
      mintAddress: summary.mintAddress,
      launchedToken: byMint.get(summary.mintAddress) ?? null,
      volumeLamports: summary.recentVolumeLamports.toString(),
      tradeCount: summary.recentTradeCount,
      uniqueTraders: summary.uniqueTraders,
    })),
  });
}
