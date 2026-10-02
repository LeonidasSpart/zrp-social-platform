export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { formatExactRatio } from "@/lib/launchpad/pump-curve-keys";

/*
 * Real historical price/volume/liquidity/holder data for a mint, read
 * exclusively from AnalyticsSnapshot rows the launchpad-analytics-snapshot
 * cron wrote (see that route) - never generated, interpolated, or
 * backfilled. If the mint's first recorded snapshot is newer than the
 * requested range's start, `insufficientHistory` says so explicitly (with
 * the real first-observed timestamp) instead of silently returning a
 * shorter series the caller might mistake for the full range, or worse,
 * fabricating earlier points.
 */
const RANGE_MS: Record<string, number> = {
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "6h": 6 * 60 * 60_000,
  "24h": 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000,
  "30d": 30 * 24 * 60 * 60_000,
};
const METRICS = new Set(["price", "volume", "liquidity", "holders"]);

export async function GET(req: NextRequest, { params }: { params: Promise<{ mint: string }> }) {
  const limitCheck = await rateLimit(req, { limit: 60, window: 60, type: "launchpad-token-history" });
  if (!limitCheck.success) return limitCheck.response;

  const { mint } = await params;
  const metric = req.nextUrl.searchParams.get("metric") ?? "price";
  const range = req.nextUrl.searchParams.get("range") ?? "24h";

  if (!METRICS.has(metric)) {
    return NextResponse.json({ error: "metric must be one of price, volume, liquidity, holders." }, { status: 400 });
  }
  const rangeMs = RANGE_MS[range];
  if (!rangeMs) {
    return NextResponse.json({ error: "range must be one of 5m, 15m, 1h, 6h, 24h, 7d, 30d." }, { status: 400 });
  }

  const firstSnapshot = await prisma.analyticsSnapshot.findFirst({
    where: { mintAddress: mint },
    orderBy: { takenAt: "asc" },
    select: { takenAt: true },
  });

  if (!firstSnapshot) {
    return NextResponse.json({
      status: "NO_HISTORY",
      metric,
      range,
      points: [],
      insufficientHistory: { available: false, firstObservedAt: null, message: "No historical data recorded yet for this token." },
    });
  }

  const since = new Date(Date.now() - rangeMs);
  const rangeStart = since > firstSnapshot.takenAt ? since : firstSnapshot.takenAt;

  const rows = await prisma.analyticsSnapshot.findMany({
    where: { mintAddress: mint, takenAt: { gte: rangeStart } },
    orderBy: { takenAt: "asc" },
    select: {
      takenAt: true,
      priceQuoteLamports: true,
      priceTokenRaw: true,
      buyVolumeLamports: true,
      sellVolumeLamports: true,
      tradeCount: true,
      liquidityTotalLamports: true,
      poolCount: true,
      holderCount: true,
      marketCapLamports: true,
    },
  });

  const points = rows.map((row) => {
    switch (metric) {
      case "price":
        return {
          timestamp: row.takenAt.toISOString(),
          price:
            row.priceQuoteLamports && row.priceTokenRaw
              ? formatExactRatio(BigInt(row.priceQuoteLamports.toString()), BigInt(row.priceTokenRaw.toString()))
              : null,
          marketCapLamports: row.marketCapLamports?.toString() ?? null,
          source: "pump_bonding_curve",
        };
      case "volume":
        return {
          timestamp: row.takenAt.toISOString(),
          buyVolumeLamports: row.buyVolumeLamports.toString(),
          sellVolumeLamports: row.sellVolumeLamports.toString(),
          totalVolumeLamports: (BigInt(row.buyVolumeLamports.toString()) + BigInt(row.sellVolumeLamports.toString())).toString(),
          tradeCount: row.tradeCount,
          source: "indexed_trades",
        };
      case "liquidity":
        return {
          timestamp: row.takenAt.toISOString(),
          liquidityTotalLamports: row.liquidityTotalLamports.toString(),
          poolCount: row.poolCount,
          source: "live_pool_read",
        };
      case "holders":
      default:
        return {
          timestamp: row.takenAt.toISOString(),
          holderCount: row.holderCount,
          source: "program_accounts_scan",
        };
    }
  });

  const requestedStart = since;
  const insufficient = firstSnapshot.takenAt > requestedStart;

  return NextResponse.json({
    status: "OK",
    metric,
    range,
    points,
    insufficientHistory: insufficient
      ? {
          available: true,
          firstObservedAt: firstSnapshot.takenAt.toISOString(),
          message: `${range} history unavailable. Tracking for this token started ${firstSnapshot.takenAt.toISOString()}.`,
        }
      : { available: true, firstObservedAt: firstSnapshot.takenAt.toISOString(), message: null },
  });
}
