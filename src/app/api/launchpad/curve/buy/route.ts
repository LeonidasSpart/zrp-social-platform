export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
// ⚠️ SECURITY: getVerifiedToken overlays the database's current
// role/isAdmin/plan/banned onto the decoded JWT - see src/lib/auth-guards.ts.
import { getVerifiedToken as getToken } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { rateLimitByIpAndUser } from "@/lib/rate-limit";
import { jsonWithDecimalStrings } from "@/lib/launchpad/json";
import { getConnection } from "@/lib/solana";
import { verifyCurveTradeTransaction, CurveVerificationError } from "@/lib/launchpad/pump-curve-service";
import { verifyZrpTradeTransaction, ZrpVerificationError } from "@/lib/launchpad/zrp-launch-service";

/*
 * Records a real, independently-verified bonding-curve BUY - either venue.
 * Mirrors liquidity/add/route.ts's shape exactly: the client reports a
 * broadcast, already-confirmed transaction signature; this route looks up
 * which protocol actually launched this mint (LaunchedToken.venue) and
 * re-verifies the signature against THAT protocol's own program
 * (pump-curve-service for PUMP_CURVE, zrp-launch-service for ZRP_LAUNCH)
 * before writing anything - a client-claimed amount, side, or venue is
 * never trusted on its own. The resulting TokenTrade row (source:
 * BONDING_CURVE, no poolId) feeds the same volume index / AnalyticsSnapshot
 * / discovery ranking pipeline for this mint regardless of venue.
 */
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = token.id as string;

    const limit = await rateLimitByIpAndUser(req, userId, { limit: 30, window: 300, type: "launchpad-curve-buy" });
    if (!limit.success) return limit.response;

    const body = await req.json();
    const { mintAddress, walletAddress, transactionId } = body;

    if (typeof mintAddress !== "string" || !mintAddress) {
      return NextResponse.json({ error: "mintAddress is required." }, { status: 400 });
    }
    if (typeof walletAddress !== "string" || !walletAddress) {
      return NextResponse.json({ error: "walletAddress is required." }, { status: 400 });
    }
    if (typeof transactionId !== "string" || !transactionId.trim()) {
      return NextResponse.json({ error: "Transaction ID is required." }, { status: 400 });
    }
    const cleanTxId = transactionId.trim();

    const existing = await prisma.tokenTrade.findUnique({ where: { txSignature: cleanTxId } });
    if (existing) return jsonWithDecimalStrings({ trade: existing }, { status: 200 });

    const launchedToken = await prisma.launchedToken.findUnique({ where: { mintAddress }, select: { venue: true } });
    if (!launchedToken) {
      return NextResponse.json({ error: "This mint has not been recorded as a launched token." }, { status: 404 });
    }

    let verified;
    try {
      verified =
        launchedToken.venue === "ZRP_LAUNCH"
          ? await verifyZrpTradeTransaction(getConnection(), cleanTxId, { mintAddress, walletAddress, expectedSide: "BUY" })
          : await verifyCurveTradeTransaction(getConnection(), cleanTxId, { mintAddress, walletAddress, expectedSide: "BUY" });
    } catch (err: unknown) {
      if (err instanceof CurveVerificationError || err instanceof ZrpVerificationError) {
        const status = err.status === "NOT_FOUND_YET" ? 202 : 400;
        return NextResponse.json({ error: err.message, status: err.status }, { status });
      }
      console.error("Curve buy verification error:", err);
      return NextResponse.json({ error: "Failed to verify the buy transaction." }, { status: 502 });
    }

    let trade;
    try {
      trade = await prisma.tokenTrade.create({
        data: {
          poolId: null,
          source: "BONDING_CURVE",
          mintAddress,
          txSignature: cleanTxId,
          side: "BUY",
          baseAmountRaw: verified.tokenAmountRaw.toString(),
          quoteAmountRaw: verified.solAmountLamports.toString(),
          walletAddress,
          blockTime: verified.blockTime,
          slot: verified.slot,
        },
      });
    } catch (err: any) {
      if (err?.code === "P2002") {
        const retry = await prisma.tokenTrade.findUnique({ where: { txSignature: cleanTxId } });
        if (retry) return jsonWithDecimalStrings({ trade: retry }, { status: 200 });
      }
      throw err;
    }

    return jsonWithDecimalStrings({ trade }, { status: 201 });
  } catch (error) {
    console.error("Curve buy recording error:", error);
    return NextResponse.json({ error: "Failed to record the buy transaction. Please try again." }, { status: 500 });
  }
}
