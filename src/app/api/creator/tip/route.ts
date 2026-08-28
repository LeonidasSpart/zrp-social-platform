export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { jsonWithDecimals } from "@/lib/serialize-decimal";

const PLATFORM_FEE = 0.10; // 10% platform fee
const CHARITY_PERCENTAGE = 0.35; // 35% of platform fee goes to charity

export async function POST(req: NextRequest) {
  // Tip verification does real RPC + DB work per call - cap abuse.
  const limit = await rateLimit(req, { limit: 10, window: 60, type: "creator-tip" });
  if (!limit.success) return limit.response;

  try {
    // ─────────────────────────────────────────────────────────────
    // Authentication
    // ─────────────────────────────────────────────────────────────

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

    if (!senderId) {
      return NextResponse.json(
        { error: "Invalid authentication token." },
        { status: 401 }
      );
    }

    const sender = await prisma.user.findUnique({
      where: { id: senderId },
      select: { verifiedSolanaWallet: true },
    });

    // ─────────────────────────────────────────────────────────────
    // Parse request
    // ─────────────────────────────────────────────────────────────

    const body = await req.json();

    const {
      recipientId,
      amount,
      message,
      transactionId,
    } = body;

    // ─────────────────────────────────────────────────────────────
    // Validation
    // ─────────────────────────────────────────────────────────────

    const numericAmount = Number(amount);

    if (
      !recipientId ||
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0
    ) {
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

    if (
      !transactionId ||
      typeof transactionId !== "string"
    ) {
      return NextResponse.json(
        { error: "Transaction ID is required." },
        { status: 400 }
      );
    }

    // Optional sanity limit.
    // Prevent accidentally enormous values being submitted.
    if (numericAmount > 1_000_000) {
      return NextResponse.json(
        { error: "Tip amount is too large." },
        { status: 400 }
      );
    }

    // ─────────────────────────────────────────────────────────────
    // Check duplicate transaction
    // ─────────────────────────────────────────────────────────────

    const existingTip = await prisma.tip.findUnique({
      where: {
        transactionId,
      },
    });

    if (existingTip) {
      return NextResponse.json(
        { error: "Transaction already processed." },
        { status: 409 }
      );
    }

    // Same signature reuse guard as premium purchases - a transactionId
    // is only ever allowed to credit one payment record, tip or
    // purchase, ever.
    const reusedAsPurchase = await prisma.premiumPurchase.findUnique({
      where: { transactionId },
    });
    if (reusedAsPurchase) {
      return NextResponse.json(
        { error: "This transaction has already been used for a payment." },
        { status: 409 }
      );
    }

    // ─────────────────────────────────────────────────────────────
    // Verify transaction on-chain
    //
    // IMPORTANT:
    // This is intentionally a dynamic import.
    //
    // Importing "@/lib/solana" at module level was causing Next.js
    // build-time evaluation and the "_bn" error.
    // ─────────────────────────────────────────────────────────────

    let verifiedAmount: number;

    try {
      const { verifyUsdcTransaction } = await import("@/lib/solana");

      const result = await verifyUsdcTransaction(transactionId);

      if (!result || !result.valid) {
        return NextResponse.json(
          { error: "Invalid or pending transaction." },
          { status: 400 }
        );
      }

      verifiedAmount = Number(result.amount);

      if (
        !Number.isFinite(verifiedAmount) ||
        verifiedAmount <= 0
      ) {
        return NextResponse.json(
          { error: "Could not determine the verified transaction amount." },
          { status: 400 }
        );
      }

      console.log("USDC transaction verified:", {
        transactionId,
        verifiedAmount,
        requestedAmount: numericAmount,
      });

      // ─────────────────────────────────────────────────────────
      // IMPORTANT SECURITY CHECK
      //
      // Never trust the amount sent by the browser.
      // The blockchain amount must match the requested tip amount.
      // ─────────────────────────────────────────────────────────

      const difference = Math.abs(
        verifiedAmount - numericAmount
      );

      // USDC normally has 6 decimals.
      const tolerance = 0.000001;

      if (difference > tolerance) {
        return NextResponse.json(
          {
            error: "Transaction amount does not match the tip amount.",
            verifiedAmount,
            requestedAmount: numericAmount,
          },
          { status: 400 }
        );
      }

      // ⚠️ SECURITY: bind the on-chain sender to the authenticated ZRP
      // account. Without this, verifying that *a* valid payment arrived
      // says nothing about who sent it - anyone could submit someone
      // else's public transaction signature and claim the tip credit
      // for their own account. Enforced once the account has gone
      // through the signature-based wallet link flow
      // (/api/wallet/link-challenge + link-verify); accounts that
      // haven't linked a wallet yet keep today's behavior so existing
      // tipping isn't broken by this change.
      if (
        sender?.verifiedSolanaWallet &&
        result.from &&
        result.from !== sender.verifiedSolanaWallet
      ) {
        return NextResponse.json(
          {
            error:
              "This transaction was sent from a wallet that isn't linked to your account.",
          },
          { status: 400 }
        );
      }
    } catch (err: unknown) {
      console.error(
        "Transaction verification error:",
        err
      );

      const errorMessage =
        err instanceof Error
          ? err.message
          : "Unknown transaction verification error";

      return NextResponse.json(
        {
          error:
            "Failed to verify transaction: " +
            errorMessage,
        },
        { status: 400 }
      );
    }

    // ─────────────────────────────────────────────────────────────
    // Check creator profile
    // ─────────────────────────────────────────────────────────────

    const creatorProfile =
      await prisma.creatorProfile.findUnique({
        where: {
          userId: recipientId,
        },
        include: {
          user: true,
        },
      });

    if (
      !creatorProfile ||
      !creatorProfile.tipsEnabled
    ) {
      return NextResponse.json(
        {
          error:
            "This creator is not accepting tips.",
        },
        { status: 400 }
      );
    }

    // ─────────────────────────────────────────────────────────────
    // Calculate fees - Decimal arithmetic so the fee split doesn't
    // accumulate binary floating-point error (see the premium-purchase
    // route for the same reasoning).
    // ─────────────────────────────────────────────────────────────

    const decimalAmount = new Prisma.Decimal(numericAmount);

    const platformFee =
      decimalAmount.times(PLATFORM_FEE);

    const charityAmount =
      platformFee.times(CHARITY_PERCENTAGE);

    const creatorAmount =
      decimalAmount.minus(platformFee);

    // ─────────────────────────────────────────────────────────────
    // Create tip + credit creator balance atomically. The DB's unique
    // constraint on transactionId is the race-proof guard against two
    // concurrent requests both passing the earlier duplicate check.
    // ─────────────────────────────────────────────────────────────

    let tip;
    try {
      [tip] = await prisma.$transaction([
        prisma.tip.create({
          data: {
            senderId,
            recipientId,
            creatorProfileId: creatorProfile.id,

            amount: numericAmount,

            message:
              typeof message === "string"
                ? message.slice(0, 1000)
                : null,

            transactionId,

            platformFee,
            charityAmount,
            creatorAmount,

            status: "COMPLETED",
          },
        }),
        prisma.creatorProfile.update({
          where: {
            id: creatorProfile.id,
          },
          data: {
            totalTips: {
              increment: numericAmount,
            },

            totalEarnings: {
              increment: creatorAmount,
            },

            balance: {
              increment: creatorAmount,
            },
          },
        }),
      ]);
    } catch (err: any) {
      if (err?.code === "P2002") {
        return NextResponse.json(
          { error: "Transaction already processed." },
          { status: 409 }
        );
      }
      throw err;
    }

    // ─────────────────────────────────────────────────────────────
    // Create notification
    // ─────────────────────────────────────────────────────────────

    await prisma.notification.create({
      data: {
        userId: recipientId,
        fromUserId: senderId,
        type: "TIP",
      },
    });

    // ─────────────────────────────────────────────────────────────
    // Response
    // ─────────────────────────────────────────────────────────────

    return jsonWithDecimals({
      success: true,

      tip,

      message: "Tip sent successfully!",

      breakdown: {
        amount: numericAmount,
        platformFee,
        charityAmount,
        creatorAmount,
      },
    });
  } catch (error: unknown) {
    console.error("Tip error:", error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : "Internal server error";

    return NextResponse.json(
      {
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
