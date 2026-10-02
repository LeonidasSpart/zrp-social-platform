export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { rateLimit } from "@/lib/rate-limit";
import { getConnection } from "@/lib/solana";
import { canonicalPumpPoolPda } from "@/lib/launchpad/pump-curve-keys";
import { getPumpSwapPoolState } from "@/lib/launchpad/pumpswap-pool-service";

/*
 * Real, live PumpSwap pool state for a mint that has graduated off its
 * pump bonding curve - reserves, LP supply and spot price all decoded
 * directly from chain (see pumpswap-pool-service.ts), never a placeholder
 * shown just because the pool exists. The pool address is always
 * re-derived here (canonicalPumpPoolPda), never trusted from a query
 * param, matching every other derive-don't-trust route in this module.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ mint: string }> }) {
  const limitCheck = await rateLimit(req, { limit: 60, window: 60, type: "launchpad-token-pumpswap-pool" });
  if (!limitCheck.success) return limitCheck.response;

  const { mint } = await params;
  let pool: PublicKey;
  try {
    pool = canonicalPumpPoolPda(new PublicKey(mint));
  } catch {
    return NextResponse.json({ error: "Invalid mint address." }, { status: 400 });
  }

  const state = await getPumpSwapPoolState(getConnection(), pool.toBase58());
  return NextResponse.json({ pool: state });
}
