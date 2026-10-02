export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { getVolumeBuckets } from "@/lib/launchpad/volume-index-service";

/*
 * Real, bucketed buy/sell volume from indexed swaps
 * (volume-index-service.ts / the launchpad-volume-sync cron job) - never
 * estimated. A pool with no trade history yet (including one just
 * created, before the next cron run) correctly reports zero volume for
 * every window rather than omitting the field or guessing.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ mint: string }> }) {
  const limitCheck = await rateLimit(req, { limit: 60, window: 60, type: "launchpad-token-volume" });
  if (!limitCheck.success) return limitCheck.response;

  const { mint } = await params;
  const pools = await prisma.tokenPool.findMany({ where: { status: "ACTIVE", baseMint: mint }, select: { id: true, poolAddress: true } });

  if (pools.length === 0) {
    return NextResponse.json({ status: "NO_POOLS", pools: [] });
  }

  const results = await Promise.all(
    pools.map(async (pool) => ({ poolId: pool.id, poolAddress: pool.poolAddress, buckets: await getVolumeBuckets(pool.id) }))
  );

  return NextResponse.json({ status: "OK", pools: results });
}
