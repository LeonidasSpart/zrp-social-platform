export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getConnection } from "@/lib/solana";
import { getCurveState, getBuyQuote, getSellQuote } from "@/lib/launchpad/pump-curve-service";

/*
 * Real, live pump bonding-curve state for a mint - price, reserves,
 * progress, graduation flag, all decoded directly from chain (see
 * pump-curve-service.ts). `status: "NO_CURVE"` means this mint was never
 * launched through pump's program (e.g. a plain ZRP LaunchedToken) - never
 * confused with an empty/zero curve, which would be status "OK".
 *
 * Optional ?side=buy|sell&amount=<raw units>&slippageBps=<bps> also
 * returns a quote for that trade (lamports for buy, raw token units for
 * sell) - the same numbers the Buy/Sell UI shows before a wallet-signed
 * trade, computed from the same live curve read.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ mint: string }> }) {
  const limitCheck = await rateLimit(req, { limit: 60, window: 60, type: "launchpad-token-curve" });
  if (!limitCheck.success) return limitCheck.response;

  const { mint } = await params;
  const connection = getConnection();
  const state = await getCurveState(connection, mint);

  const side = req.nextUrl.searchParams.get("side");
  const amountParam = req.nextUrl.searchParams.get("amount");
  const slippageBpsParam = req.nextUrl.searchParams.get("slippageBps");
  const slippageBps = slippageBpsParam ? Number(slippageBpsParam) : 100; // default 1%

  if (!side || !amountParam) {
    return NextResponse.json({ curve: state, quote: null });
  }
  if (!Number.isFinite(slippageBps) || slippageBps < 0 || slippageBps > 5000) {
    return NextResponse.json({ error: "slippageBps must be between 0 and 5000." }, { status: 400 });
  }

  let amountRaw: bigint;
  try {
    amountRaw = BigInt(amountParam);
    if (amountRaw <= BigInt(0)) throw new Error("non-positive");
  } catch {
    return NextResponse.json({ error: "amount must be a positive integer string." }, { status: 400 });
  }

  const quote =
    side === "buy"
      ? await getBuyQuote(connection, mint, amountRaw, slippageBps)
      : side === "sell"
        ? await getSellQuote(connection, mint, amountRaw, slippageBps)
        : null;
  if (!quote) {
    return NextResponse.json({ error: "side must be 'buy' or 'sell'." }, { status: 400 });
  }

  return NextResponse.json({ curve: state, quote });
}
