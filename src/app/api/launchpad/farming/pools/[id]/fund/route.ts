export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
// ⚠️ SECURITY: getVerifiedToken is a drop-in for getToken() that overlays the
// database's current role/isAdmin/plan/banned onto the decoded JWT and
// returns null for a banned or deleted account - see src/lib/auth-guards.ts.
import { getVerifiedToken as getToken } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { rateLimitByIpAndUser } from "@/lib/rate-limit";
import { jsonWithDecimalStrings } from "@/lib/launchpad/json";
import { checkPaymentSender } from "@/lib/payment-sender";

// ─── POST: top up a farming pool's reward reserve - pay externally,
// paste the tx signature, same pattern as every other payment-in flow ─
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = token.id as string;

    const limit = await rateLimitByIpAndUser(req, userId, { limit: 20, window: 3600, type: "farming-pool-fund" });
    if (!limit.success) return limit.response;

    const { id } = await params;
    const body = await req.json();
    const { amount, transactionId } = body;

    const amountStr = typeof amount === "string" ? amount.trim() : typeof amount === "number" ? String(Math.trunc(amount)) : "";
    if (!/^[1-9]\d*$/.test(amountStr) || amountStr.length > 20) {
      return NextResponse.json({ error: "Amount must be a positive whole number of tokens." }, { status: 400 });
    }
    if (typeof transactionId !== "string" || !transactionId) {
      return NextResponse.json({ error: "Transaction ID is required." }, { status: 400 });
    }

    const pool = await prisma.farmingPool.findUnique({ where: { id }, include: { rewardToken: true } });
    if (!pool || !pool.rewardToken.mintAddress) {
      return NextResponse.json({ error: "Farming pool not found." }, { status: 404 });
    }
    // ⚠️ SECURITY: only the pool's own creator can fund its reward
    // reserve through this endpoint - matches every other creator-only
    // launchpad action.
    if (pool.creatorId !== userId) {
      return NextResponse.json({ error: "Only the pool's creator can fund it." }, { status: 403 });
    }

    let decimalMultiplier = BigInt(1);
    for (let i = 0; i < pool.rewardToken.decimals; i += 1) decimalMultiplier *= BigInt(10);
    const rawAmount = BigInt(amountStr) * decimalMultiplier;

    const existingClaim = await prisma.consumedPaymentTransaction.findUnique({ where: { transactionId } });
    if (existingClaim) {
      return NextResponse.json({ error: "Transaction already processed." }, { status: 409 });
    }

    try {
      const { verifySplTransferToPlatform } = await import("@/lib/launchpad/spl-transfer-verify");
      const result = await verifySplTransferToPlatform(transactionId, pool.rewardToken.mintAddress);

      if (result.rawAmount !== rawAmount) {
        return NextResponse.json(
          { error: "The deposited amount does not match the funding amount.", depositedRaw: result.rawAmount.toString(), requiredRaw: rawAmount.toString() },
          { status: 400 }
        );
      }

      const senderError = await checkPaymentSender(userId, result.from);
      if (senderError) {
        return NextResponse.json({ error: senderError }, { status: 400 });
      }
    } catch (err: unknown) {
      console.error("Farming pool funding verification error:", err);
      const message = err instanceof Error ? err.message : "Unknown transaction verification error";
      return NextResponse.json({ error: `Failed to verify deposit: ${message}` }, { status: 400 });
    }

    const depositId = randomUUID();
    try {
      await prisma.$transaction([
        prisma.consumedPaymentTransaction.create({
          data: { transactionId, paymentType: "farming_reward_funding", paymentId: depositId },
        }),
        prisma.farmingRewardDeposit.create({
          data: { id: depositId, poolId: pool.id, amountRaw: rawAmount.toString(), transactionId },
        }),
        prisma.farmingPool.update({
          where: { id: pool.id },
          data: { rewardReserveRaw: { increment: rawAmount.toString() } },
        }),
      ]);
    } catch (err: any) {
      if (err?.code === "P2002") {
        return NextResponse.json({ error: "Transaction already processed." }, { status: 409 });
      }
      throw err;
    }

    const updatedPool = await prisma.farmingPool.findUnique({ where: { id: pool.id } });
    return jsonWithDecimalStrings({ pool: updatedPool }, { status: 201 });
  } catch (error) {
    console.error("Farming pool funding error:", error);
    return NextResponse.json({ error: "Failed to fund farming pool. Please try again." }, { status: 500 });
  }
}
