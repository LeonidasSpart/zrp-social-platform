export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import { getConnection } from "@/lib/solana";
import { getCurveState, getBuyQuote, getSellQuote, CurveState, CurveQuote } from "@/lib/launchpad/pump-curve-service";
import { getZrpCurveState, getZrpBuyQuote, getZrpSellQuote, ZrpCurveState, ZrpCurveQuote } from "@/lib/launchpad/zrp-launch-service";

/*
 * Real, live bonding-curve state for a mint - price, reserves, progress,
 * graduation flag, all decoded directly from chain - for either venue.
 * `status: "NO_CURVE"` means this mint was never launched through a
 * bonding-curve program at all (e.g. a plain DIRECT_MINT LaunchedToken) -
 * never confused with an empty/zero curve, which would be status "OK".
 *
 * Which protocol to read is decided by LaunchedToken.venue, never guessed
 * or taken from a query param - a ZRP-native mint is read through
 * zrp-launch-service.ts (ZRP's own program), a PUMP_CURVE mint through
 * pump-curve-service.ts, exactly as their respective creation routes
 * recorded them. The ZRP curve state is mapped onto the exact same
 * response shape pump's curve state already uses, so the existing token
 * detail page UI (src/app/launchpad/token/[mint]/page.tsx) needs no
 * venue-specific branching of its own.
 *
 * Optional ?side=buy|sell&amount=<raw units>&slippageBps=<bps> also
 * returns a quote for that trade (lamports for buy, raw token units for
 * sell) - the same numbers the Buy/Sell UI shows before a wallet-signed
 * trade, computed from the same live curve read.
 */

function mapZrpCurveState(zrp: ZrpCurveState): CurveState {
  const supply = zrp.tokenTotalSupplyRaw ? BigInt(zrp.tokenTotalSupplyRaw) : null;
  const virtualSol = zrp.virtualSolLamports ? BigInt(zrp.virtualSolLamports) : null;
  const virtualToken = zrp.virtualTokenReservesRaw ? BigInt(zrp.virtualTokenReservesRaw) : null;
  const marketCapLamports = virtualSol !== null && virtualToken !== null && virtualToken > BigInt(0) && supply !== null
    ? ((virtualSol * supply) / virtualToken).toString()
    : null;
  return {
    status: zrp.status,
    reason: zrp.reason,
    bondingCurveAddress: zrp.bondingCurveAddress,
    graduated: zrp.graduated,
    virtualTokenReservesRaw: zrp.virtualTokenReservesRaw,
    virtualQuoteLamports: zrp.virtualSolLamports,
    realTokenReservesRaw: zrp.realTokenReservesRaw,
    realQuoteLamports: zrp.realSolLamports,
    priceQuoteLamports: zrp.virtualSolLamports,
    priceTokenRaw: zrp.virtualTokenReservesRaw,
    priceDisplay: zrp.priceDisplay,
    progressBps: zrp.progressBps,
    marketCapLamports,
    tokenTotalSupplyRaw: zrp.tokenTotalSupplyRaw,
  };
}

function mapZrpCurveQuote(zrp: ZrpCurveQuote): CurveQuote {
  return {
    status: zrp.status,
    reason: zrp.reason,
    tokenAmountRaw: zrp.tokenAmountRaw,
    solAmountLamports: zrp.solAmountLamports,
    protocolFeeLamports: zrp.feeLamports,
    creatorFeeLamports: "0",
    totalFeeLamports: zrp.feeLamports,
    minimumReceivedRaw: zrp.minimumReceivedRaw,
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ mint: string }> }) {
  const limitCheck = await rateLimit(req, { limit: 60, window: 60, type: "launchpad-token-curve" });
  if (!limitCheck.success) return limitCheck.response;

  const { mint } = await params;
  const connection = getConnection();

  const launchedToken = await prisma.launchedToken.findUnique({ where: { mintAddress: mint }, select: { venue: true } });
  const isZrp = launchedToken?.venue === "ZRP_LAUNCH";

  const state = isZrp ? mapZrpCurveState(await getZrpCurveState(connection, mint)) : await getCurveState(connection, mint);

  const side = req.nextUrl.searchParams.get("side");
  const amountParam = req.nextUrl.searchParams.get("amount");
  const slippageBpsParam = req.nextUrl.searchParams.get("slippageBps");
  const slippageBps = slippageBpsParam ? Number(slippageBpsParam) : 100; // default 1%

  const venue = isZrp ? "ZRP_LAUNCH" : "PUMP_CURVE";

  if (!side || !amountParam) {
    return NextResponse.json({ curve: state, quote: null, venue });
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

  let quote: CurveQuote | null;
  if (side === "buy") {
    quote = isZrp ? mapZrpCurveQuote(await getZrpBuyQuote(connection, mint, amountRaw, slippageBps)) : await getBuyQuote(connection, mint, amountRaw, slippageBps);
  } else if (side === "sell") {
    quote = isZrp ? mapZrpCurveQuote(await getZrpSellQuote(connection, mint, amountRaw, slippageBps)) : await getSellQuote(connection, mint, amountRaw, slippageBps);
  } else {
    return NextResponse.json({ error: "side must be 'buy' or 'sell'." }, { status: 400 });
  }

  return NextResponse.json({ curve: state, quote, venue });
}
