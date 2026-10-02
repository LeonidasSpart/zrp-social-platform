export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getConnection } from "@/lib/solana";
import { indexTopHolders } from "@/lib/launchpad/holder-index-service";
import { CREATE_CPMM_POOL_AUTH } from "@raydium-io/raydium-sdk-v2";

/*
 * Real, owner-deduplicated top-holder concentration - see
 * holder-index-service.ts for exactly what "real" means here and its
 * disclosed scope limit (top 20 accounts, not a full holder count).
 * Every Raydium CPMM pool's vaults share one program-wide authority
 * account (CREATE_CPMM_POOL_AUTH), so excluding that one address covers
 * every pool for every mint - a token's own liquidity is never
 * misreported as a "whale" holder.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ mint: string }> }) {
  const limitCheck = await rateLimit(req, { limit: 30, window: 60, type: "launchpad-token-holders" });
  if (!limitCheck.success) return limitCheck.response;

  const { mint } = await params;

  const result = await indexTopHolders(getConnection(), mint, {
    excludeOwners: [CREATE_CPMM_POOL_AUTH.toBase58()],
  });

  return NextResponse.json(result);
}
