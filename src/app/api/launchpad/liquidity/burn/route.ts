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
import { verifyLpBurnTransaction, PoolVerificationError } from "@/lib/launchpad/raydium-pool-service";

/*
 * Records a real LP-token burn - the classic "liquidity locked forever"
 * trust signal. Burning is irreversible on-chain; this route only ever
 * records what the chain already, irrevocably did, it never performs the
 * burn itself (see src/lib/launchpad/client-liquidity.ts's
 * burnLpFromBrowser, wallet-signed).
 */
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = token.id as string;

    const limit = await rateLimitByIpAndUser(req, userId, { limit: 20, window: 300, type: "launchpad-liquidity-burn" });
    if (!limit.success) return limit.response;

    const body = await req.json();
    const { poolId, walletAddress, transactionId } = body;

    if (typeof poolId !== "string" || !poolId) {
      return NextResponse.json({ error: "poolId is required." }, { status: 400 });
    }
    if (typeof walletAddress !== "string" || !walletAddress) {
      return NextResponse.json({ error: "walletAddress is required." }, { status: 400 });
    }
    if (typeof transactionId !== "string" || !transactionId.trim()) {
      return NextResponse.json({ error: "Transaction ID is required." }, { status: 400 });
    }
    const cleanTxId = transactionId.trim();

    const pool = await prisma.tokenPool.findUnique({ where: { id: poolId } });
    if (!pool || pool.status !== "ACTIVE") {
      return NextResponse.json({ error: "Pool not found or not active." }, { status: 404 });
    }

    const existing = await prisma.liquidityEvent.findUnique({ where: { transactionId: cleanTxId } });
    if (existing) return jsonWithDecimalStrings({ event: existing }, { status: 200 });

    let verified;
    try {
      verified = await verifyLpBurnTransaction(getConnection(), cleanTxId, { lpMint: pool.lpMint, walletAddress });
    } catch (err: unknown) {
      if (err instanceof PoolVerificationError) {
        const status = err.status === "NOT_FOUND_YET" ? 202 : 400;
        return NextResponse.json({ error: err.message, status: err.status }, { status });
      }
      console.error("LP burn verification error:", err);
      return NextResponse.json({ error: "Failed to verify the LP burn transaction." }, { status: 502 });
    }

    let event;
    try {
      event = await prisma.liquidityEvent.create({
        data: {
          poolId: pool.id,
          type: "BURN",
          status: "SUCCESS",
          walletAddress,
          transactionId: cleanTxId,
          lpAmountRaw: verified.lpAmountRaw.toString(),
        },
      });
    } catch (err: any) {
      if (err?.code === "P2002") {
        const retry = await prisma.liquidityEvent.findUnique({ where: { transactionId: cleanTxId } });
        if (retry) return jsonWithDecimalStrings({ event: retry }, { status: 200 });
      }
      throw err;
    }

    return jsonWithDecimalStrings({ event }, { status: 201 });
  } catch (error) {
    console.error("LP burn recording error:", error);
    return NextResponse.json({ error: "Failed to record the LP burn transaction. Please try again." }, { status: 500 });
  }
}
