import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { getConnection } from "@/lib/solana";
import { syncPoolVolume } from "@/lib/launchpad/volume-index-service";

export const dynamic = "force-dynamic";

/*
 * Same CRON_SECRET auth as every other /api/cron/* route - deliberately
 * fails CLOSED if the env var is unset. Walks every active pool's real
 * transaction history and records genuine swaps as TokenTrade rows (see
 * volume-index-service.ts). Pools are synced sequentially, not in
 * parallel, to keep RPC load for one cron run bounded and predictable.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pools = await prisma.tokenPool.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, poolAddress: true, baseVault: true, quoteVault: true, baseMint: true },
  });

  const connection = getConnection();
  const results = [];
  for (const pool of pools) {
    results.push(await syncPoolVolume(connection, pool));
  }

  return NextResponse.json({ syncedPools: results.length, results });
}
