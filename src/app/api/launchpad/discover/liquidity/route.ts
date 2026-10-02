export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

/*
 * Highest-liquidity ranking: sorts by the latest AnalyticsSnapshot's real
 * liquidityTotalLamports (summed from live pool reads at snapshot time -
 * see the cron route) per mint. Same "latest snapshot per mint" pattern as
 * discover/holders/route.ts.
 */
export async function GET(req: NextRequest) {
  const limitCheck = await rateLimit(req, { limit: 30, window: 60, type: "launchpad-discover-liquidity" });
  if (!limitCheck.success) return limitCheck.response;

  const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(1, limitParam), 50) : 20;

  const latestPerMint = await prisma.analyticsSnapshot.groupBy({ by: ["mintAddress"], _max: { takenAt: true } });

  const withTakenAt = latestPerMint.filter(
    (row): row is typeof row & { _max: { takenAt: Date } } => row._max.takenAt !== null
  );
  const rows = await Promise.all(
    withTakenAt.map(({ mintAddress, _max }) =>
      prisma.analyticsSnapshot.findUnique({
        where: { mintAddress_takenAt: { mintAddress, takenAt: _max.takenAt } },
        select: { mintAddress: true, liquidityTotalLamports: true, poolCount: true },
      })
    )
  );

  const ranked = rows
    .filter((r): r is NonNullable<(typeof rows)[number]> => r !== null)
    .map((r) => ({ mintAddress: r.mintAddress, liquidityTotalLamports: BigInt(r.liquidityTotalLamports.toString()), poolCount: r.poolCount }))
    .filter((r) => r.liquidityTotalLamports > BigInt(0))
    .sort((a, b) => (a.liquidityTotalLamports < b.liquidityTotalLamports ? 1 : a.liquidityTotalLamports > b.liquidityTotalLamports ? -1 : 0))
    .slice(0, limit);

  const launchedTokens = await prisma.launchedToken.findMany({
    where: { mintAddress: { in: ranked.map((r) => r.mintAddress) } },
    select: { mintAddress: true, name: true, symbol: true, imageUrl: true },
  });
  const byMint = new Map(launchedTokens.map((t) => [t.mintAddress as string, t]));

  return NextResponse.json({
    tokens: ranked.map((r) => ({
      mintAddress: r.mintAddress,
      launchedToken: byMint.get(r.mintAddress) ?? null,
      liquidityTotalLamports: r.liquidityTotalLamports.toString(),
      poolCount: r.poolCount,
    })),
  });
}
