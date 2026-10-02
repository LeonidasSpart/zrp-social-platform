export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { getVolumeBuckets, getVolumeBucketsForMint } from "@/lib/launchpad/volume-index-service";

/*
 * Real, bucketed buy/sell volume from indexed swaps
 * (volume-index-service.ts / the launchpad-volume-sync cron job) - never
 * estimated. `mintTotal` covers every TokenTrade for this mint regardless
 * of venue (Raydium pool swap or pump bonding-curve trade - see the
 * TradeSource enum), so it is always the real total; `pools` additionally
 * breaks the same data down per active Raydium pool for UIs that still
 * want that detail. A mint with no trade history yet (including one just
 * created, before the next cron run) correctly reports zero volume for
 * every window rather than omitting the field or guessing.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ mint: string }> }) {
  const limitCheck = await rateLimit(req, { limit: 60, window: 60, type: "launchpad-token-volume" });
  if (!limitCheck.success) return limitCheck.response;

  const { mint } = await params;
  const pools = await prisma.tokenPool.findMany({ where: { status: "ACTIVE", baseMint: mint }, select: { id: true, poolAddress: true } });

  const [mintTotal, poolResults] = await Promise.all([
    getVolumeBucketsForMint(mint),
    Promise.all(pools.map(async (pool) => ({ poolId: pool.id, poolAddress: pool.poolAddress, buckets: await getVolumeBuckets(pool.id) }))),
  ]);

  return NextResponse.json({ status: "OK", mintTotal, pools: poolResults });
}
