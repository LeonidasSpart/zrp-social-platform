export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
// ⚠️ SECURITY: getVerifiedToken is a drop-in for getToken() that overlays the
// database's current role/isAdmin/plan/banned onto the decoded JWT and
// returns null for a banned or deleted account - see src/lib/auth-guards.ts.
import { getVerifiedToken as getToken } from "@/lib/auth-guards";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { jsonWithDecimals } from "@/lib/serialize-decimal";
import { rejectNativePayment } from "@/lib/native-payment-policy.server";

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

    // Tips take a platform cut and unlock nothing distinguishable from a
    // simple digital gratuity - a store-sensitive payment surface, blocked
    // for the native app. See src/lib/native-payment-policy.ts.
    const nativeBlock = rejectNativePayment(req);
    if (nativeBlock) return nativeBlock;

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
    //
    // ⚠️ SECURITY: a signature is only ever allowed to credit one
    // payment record, of any type, ever - checked here against the
    // single shared ConsumedPaymentTransaction table (see schema.prisma)
    // rather than against Tip/PremiumPurchase individually. Checking
    // per-table used to miss reuse against HelpContribution entirely (a
    // signature already spent as a HELP contribution could still be
    // claimed here), and even a complete set of pairwise checks would
    // still be a plain read-then-write race: two concurrent requests
    // across two different payment types could both pass every check
    // above before either had written its row. This pre-check is only
    // the fast path; the actual, race-proof guard is
    // ConsumedPaymentTransaction's own primary key, claimed atomically
    // below inside the same $transaction as the Tip row.
    // ─────────────────────────────────────────────────────────────

    const existingClaim = await prisma.consumedPaymentTransaction.findUnique({
      where: { transactionId },
    });
    if (existingClaim) {
      return NextResponse.json(
        { error: "Transaction already processed." },
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
    // Create tip + credit creator balance atomically.
    //
    // ⚠️ SECURITY: claiming ConsumedPaymentTransaction is the FIRST
    // statement in this transaction, not an afterthought - its primary
    // key on transactionId is the actual race-proof guard (the pre-check
    // above is only a fast path). Two concurrent requests for the same
    // signature, even across two different payment types, can never both
    // commit: whichever transaction reaches this insert first wins, and
    // the loser's entire transaction - Tip row included - rolls back on
    // the conflict. tipId is generated client-side so both rows can
    // reference the same id without a second round trip.
    // ─────────────────────────────────────────────────────────────

    const tipId = randomUUID();

    let tip;
    try {
      [, tip] = await prisma.$transaction([
        prisma.consumedPaymentTransaction.create({
          data: { transactionId, paymentType: "tip", paymentId: tipId },
        }),
        prisma.tip.create({
          data: {
            id: tipId,
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
