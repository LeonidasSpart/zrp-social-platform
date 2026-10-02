export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { getConnection } from "@/lib/solana";
import { readPoolLiquidity } from "@/lib/launchpad/pool-liquidity-reader";

/*
 * Real, live liquidity for every active pool backing this mint - never a
 * stored/stale figure. TokenPool only records how a pool was created;
 * "how much liquidity does it have right now" has to be re-read from the
 * chain on every request, since any trader's swap (not only ZRP's own
 * recorded add/remove events) moves the real reserves.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ mint: string }> }) {
  const limitCheck = await rateLimit(req, { limit: 60, window: 60, type: "launchpad-token-liquidity" });
  if (!limitCheck.success) return limitCheck.response;

  const { mint } = await params;
  const pools = await prisma.tokenPool.findMany({
    where: { status: "ACTIVE", OR: [{ baseMint: mint }, { quoteMint: mint }] },
  });

  if (pools.length === 0) {
    return NextResponse.json({ status: "NO_POOLS", pools: [] });
  }

  const connection = getConnection();
  const results = await Promise.all(
    pools.map(async (pool) => {
      const snapshot = await readPoolLiquidity(connection, {
        baseVault: pool.baseVault,
        quoteVault: pool.quoteVault,
        lpMint: pool.lpMint,
      });
      return {
        poolId: pool.id,
        poolAddress: pool.poolAddress,
        dex: pool.dex,
        baseMint: pool.baseMint,
        quoteMint: pool.quoteMint,
        ...snapshot,
      };
    })
  );

  return NextResponse.json({ status: "OK", pools: results });
}
