export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

/*
 * Most-holders ranking: sorts by the real, owner-deduplicated unique
 * holder count from the latest AnalyticsSnapshot per mint (see
 * full-holder-count-service.ts - excludes known burn/pool/curve
 * addresses, counts unique owner wallets, never raw token accounts).
 * Mints whose most recent snapshot has holderCount: null (indexing
 * UNAVAILABLE for that mint - e.g. too many open accounts to safely
 * enumerate) are excluded rather than ranked as zero, which would be a
 * fabricated value.
 */
export async function GET(req: NextRequest) {
  const limitCheck = await rateLimit(req, { limit: 30, window: 60, type: "launchpad-discover-holders" });
  if (!limitCheck.success) return limitCheck.response;

  const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(1, limitParam), 50) : 20;

  const latestPerMint = await prisma.analyticsSnapshot.groupBy({
    by: ["mintAddress"],
    _max: { takenAt: true },
  });

  const rows = await Promise.all(
    latestPerMint.map(async ({ mintAddress, _max }) => {
      if (!_max.takenAt) return null;
      return prisma.analyticsSnapshot.findUnique({
        where: { mintAddress_takenAt: { mintAddress, takenAt: _max.takenAt } },
        select: { mintAddress: true, holderCount: true },
      });
    })
  );

  const ranked = rows
    .filter((r): r is { mintAddress: string; holderCount: number | null } => r !== null && r.holderCount !== null)
    .sort((a, b) => (b.holderCount as number) - (a.holderCount as number))
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
      holderCount: r.holderCount,
    })),
  });
}
