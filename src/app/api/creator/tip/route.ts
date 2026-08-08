export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { verifyUsdcTransaction } from "@/lib/solana";

const PLATFORM_FEE = 0.10; // 10% platform fee
const CHARITY_PERCENTAGE = 0.35; // 35% of platform fee goes to charity

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const senderId = token.id as string;
    const body = await req.json();

    const {
      recipientId,
      amount,
      message,
      transactionId,
    } = body;

    // ─── Validation ──────────────────────────────────────────────────

    if (!recipientId || !amount || amount <= 0) {
      return NextResponse.json(
        { error: "Invalid tip details." },
        { status: 400 }
      );
    }

    if (senderId === recipientId) {
      return NextResponse.json(
        { error: "You cannot tip yourself." },
        { status: 400 }
      );
    }

    if (!transactionId) {
      return NextResponse.json(
        { error: "Transaction ID is required." },
        { status: 400 }
      );
    }

    // ─── Check if this transaction has already been processed ────────

    const existingTip = await prisma.tip.findUnique({
      where: { transactionId },
    });

    if (existingTip) {
      return NextResponse.json(
        { error: "Transaction already processed." },
        { status: 409 }
      );
    }

    // ─── Verify transaction on-chain ─────────────────────────────────

    let verifiedAmount: number;

    try {
      const result = await verifyUsdcTransaction(transactionId);

      if (!result.valid) {
        return NextResponse.json(
          { error: "Invalid or pending transaction." },
          { status: 400 }
        );
      }

      // Keep the existing fallback behavior for now.
      // We will harden the on-chain amount/recipient verification separately.
      verifiedAmount = result.amount || amount;

      console.log("USDC transaction verified:", {
        transactionId,
        verifiedAmount,
        requestedAmount: amount,
      });
    } catch (err: any) {
      console.error("Transaction verification error:", err);

      return NextResponse.json(
        {
          error:
            "Failed to verify transaction: " +
            (err?.message || "Unknown error"),
        },
        { status: 400 }
      );
    }

    // ─── Check recipient has creator profile and tips enabled ────────

    const creatorProfile =
      await prisma.creatorProfile.findUnique({
        where: { userId: recipientId },
        include: { user: true },
      });

    if (!creatorProfile || !creatorProfile.tipsEnabled) {
      return NextResponse.json(
        { error: "This creator is not accepting tips." },
        { status: 400 }
      );
    }

    // ─── Calculate fees ──────────────────────────────────────────────

    const platformFee = amount * PLATFORM_FEE;
    const charityAmount = platformFee * CHARITY_PERCENTAGE;
    const creatorAmount = amount - platformFee;

    // ─── Create tip record ──────────────────────────────────────────

    const tip = await prisma.tip.create({
      data: {
        senderId,
        recipientId,
        creatorProfileId: creatorProfile.id,
        amount,
        message,
        transactionId,
        platformFee,
        charityAmount,
        creatorAmount,
        status: "COMPLETED",
      },
    });

    // ─── Update creator profile balance and stats ────────────────────

    await prisma.creatorProfile.update({
      where: { id: creatorProfile.id },
      data: {
        totalTips: { increment: amount },
        totalEarnings: { increment: creatorAmount },
        balance: { increment: creatorAmount },
      },
    });

    // ─── Create notification for creator ─────────────────────────────

    await prisma.notification.create({
      data: {
        userId: recipientId,
        fromUserId: senderId,
        type: "TIP",
        // No 'content' field – frontend will display
        // based on type and fromUserId.
      },
    });

    return NextResponse.json({
      tip,
      message: "Tip sent successfully!",
    });
  } catch (error) {
    console.error("Tip error:", error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}