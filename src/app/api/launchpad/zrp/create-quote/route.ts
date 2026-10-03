export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getConnection } from "@/lib/solana";
import { getZrpInitialBuyQuote } from "@/lib/launchpad/zrp-launch-service";

/*
 * Real initial-buy quote for a token that does not exist yet - the
 * "optional initial buy" step of creating a token on ZRP's own bonding
 * curve. Uses the exact same math zrp-launch-service.ts already uses for
 * an existing curve's buy quote, just against GlobalConfig's own
 * configured starting reserves instead of a live curve account, so the
 * numbers shown here match what create_and_buy will actually execute
 * on-chain.
 */
export async function GET(req: NextRequest) {
  const limitCheck = await rateLimit(req, { limit: 60, window: 60, type: "launchpad-zrp-create-quote" });
  if (!limitCheck.success) return limitCheck.response;

  const amountParam = req.nextUrl.searchParams.get("solLamports");
  const slippageBpsParam = req.nextUrl.searchParams.get("slippageBps");
  const slippageBps = slippageBpsParam ? Number(slippageBpsParam) : 100;

  if (!Number.isFinite(slippageBps) || slippageBps < 0 || slippageBps > 5000) {
    return NextResponse.json({ error: "slippageBps must be between 0 and 5000." }, { status: 400 });
  }

  let solLamports: bigint;
  try {
    solLamports = BigInt(amountParam ?? "");
    if (solLamports <= BigInt(0)) throw new Error("non-positive");
  } catch {
    return NextResponse.json({ error: "solLamports must be a positive integer string." }, { status: 400 });
  }

  const quote = await getZrpInitialBuyQuote(getConnection(), solLamports, slippageBps);
  return NextResponse.json({ quote });
}
