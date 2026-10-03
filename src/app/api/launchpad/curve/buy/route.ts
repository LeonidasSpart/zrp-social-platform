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

/*
 * Records a real, independently-verified pump bonding-curve BUY. Mirrors
 * liquidity/add/route.ts's shape exactly: the client reports a broadcast,
 * already-confirmed transaction signature; this route re-verifies it
 * on-chain (see pump-curve-service.verifyCurveTradeTransaction) before
 * writing anything. A client-claimed amount or "success" is never trusted
 * on its own. The resulting TokenTrade row (source: BONDING_CURVE, no
 * poolId) feeds the same volume index / AnalyticsSnapshot / discovery
 * ranking pipeline as a Raydium pool swap for this mint.
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

    let verified;
    try {
      verified = await verifyCurveTradeTransaction(getConnection(), cleanTxId, {
        mintAddress,
        walletAddress,
        expectedSide: "BUY",
      });
    } catch (err: unknown) {
      if (err instanceof CurveVerificationError) {
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
