import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
// ⚠️ SECURITY: getVerifiedToken is a drop-in for getToken() that overlays the
// database's current role/isAdmin/plan/banned onto the decoded JWT and
// returns null for a banned or deleted account - see src/lib/auth-guards.ts.
import { getVerifiedToken as getToken } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { verifyUsdcTransaction } from "@/lib/solana";
import { rateLimit } from "@/lib/rate-limit";
import { jsonWithDecimals } from "@/lib/serialize-decimal";
import { rejectNativePayment } from "@/lib/native-payment-policy.server";

const PLATFORM_FEE = 0.10;
const CHARITY_PERCENTAGE = 0.35;

// USDC has 6 decimals; treat amounts within half a micro-unit as equal
// to avoid floating point comparison false negatives.
const AMOUNT_EPSILON = 0.0000005;

export async function POST(req: NextRequest) {
  // Payment verification does real RPC + DB work per call - cap abuse.
  const limit = await rateLimit(req, { limit: 10, window: 60, type: "premium-purchase" });
  if (!limit.success) return limit.response;

  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Unlocking gated post content via a crypto payment is a store-sensitive
    // payment surface, blocked for the native app. There is currently no
    // frontend trigger for this route at all (web included) - this is
    // defense-in-depth regardless. See src/lib/native-payment-policy.ts.
    const nativeBlock = rejectNativePayment(req);
    if (nativeBlock) return nativeBlock;

    const userId = token.id as string;
    const body = await req.json();
    const { premiumPostId, transactionId } = body;

    if (!premiumPostId) {
      return NextResponse.json({ error: "Missing premium post ID." }, { status: 400 });
    }

    if (!transactionId || typeof transactionId !== "string") {
      return NextResponse.json(
        { error: "Missing blockchain transaction signature." },
        { status: 400 }
      );
    }

    // Check if already purchased
    const existing = await prisma.premiumPurchase.findUnique({
      where: {
        premiumPostId_userId: {
          premiumPostId,
          userId,
        },
      },
    });

    if (existing) {
      return NextResponse.json({ error: "Already purchased this post." }, { status: 400 });
    }

    // ⚠️ SECURITY: a transaction signature must never be usable to credit
    // more than one payment record - without this, the same on-chain
    // transfer could be replayed against a tip, a HELP contribution, or
    // another premium purchase (or resubmitted after a failed request)
    // to claim credit twice. Checked against the single shared
    // ConsumedPaymentTransaction table (see schema.prisma) rather than
    // per-table, so reuse against a payment type this route doesn't
    // otherwise know about is still caught. This is only the fast path;
    // the actual, race-proof guard is claimed atomically below.
    const existingClaim = await prisma.consumedPaymentTransaction.findUnique({
      where: { transactionId },
    });
    if (existingClaim) {
      return NextResponse.json(
        { error: "This transaction has already been used for a payment." },
        { status: 400 }
      );
    }

    const premiumPost = await prisma.premiumPost.findUnique({
      where: { id: premiumPostId },
      include: { creatorProfile: true },
    });

    if (!premiumPost) {
      return NextResponse.json({ error: "Premium post not found." }, { status: 404 });
    }

    // ⚠️ SECURITY: independently verify the on-chain transaction before
    // crediting anything. Previously this endpoint trusted the client's
    // transactionId at face value and marked the purchase COMPLETED
    // (and credited the creator's balance) with no verification at all.
    let verification;
    try {
      verification = await verifyUsdcTransaction(transactionId);
    } catch (err: any) {
      console.error("Premium purchase transaction verification failed:", err);
      return NextResponse.json(
        { error: err?.message || "Unable to verify the blockchain transaction." },
        { status: 400 }
      );
    }

    if (verification.amount + AMOUNT_EPSILON < premiumPost.price.toNumber()) {
      return NextResponse.json(
        {
          error: `Transaction amount (${verification.amount} USDC) does not cover the required price (${premiumPost.price} USDC).`,
        },
        { status: 400 }
      );
    }

    // ⚠️ SECURITY: same sender-binding as tips (see /api/creator/tip) -
    // only enforced once the buyer has a cryptographically verified
    // wallet on file, so accounts that haven't linked one yet aren't
    // broken by this change.
    const buyer = await prisma.user.findUnique({
      where: { id: userId },
      select: { verifiedSolanaWallet: true },
    });
    if (
      buyer?.verifiedSolanaWallet &&
      verification.from &&
      verification.from !== buyer.verifiedSolanaWallet
    ) {
      return NextResponse.json(
        {
          error: "This transaction was sent from a wallet that isn't linked to your account.",
        },
        { status: 400 }
      );
    }

    // Calculate fees - Decimal arithmetic throughout so fee splits on a
    // purchase price don't accumulate the binary floating-point error a
    // plain `price * 0.1` would (e.g. 0.1 isn't exactly representable
    // in IEEE 754, so repeated fee math on many transactions can drift
    // a fraction of a cent off from the true value over time).
    const platformFee = premiumPost.price.times(PLATFORM_FEE);
    const charityAmount = platformFee.times(CHARITY_PERCENTAGE);
    const creatorAmount = premiumPost.price.minus(platformFee);

    // Create the purchase record and credit the creator atomically.
    //
    // ⚠️ SECURITY: claiming ConsumedPaymentTransaction is the FIRST
    // statement, not an afterthought - its primary key on transactionId
    // is the actual race-proof guard against double-spending the same
    // signature, including across payment types (two concurrent requests
    // - even to two different routes - could both pass the reuse check
    // above before either has written its row; only one of them can win
    // this insert). purchaseId is generated client-side so both rows can
    // reference the same id without a second round trip.
    const purchaseId = randomUUID();

    let purchase;
    try {
      [, purchase] = await prisma.$transaction([
        prisma.consumedPaymentTransaction.create({
          data: { transactionId, paymentType: "premium_purchase", paymentId: purchaseId },
        }),
        prisma.premiumPurchase.create({
          data: {
            id: purchaseId,
            premiumPostId,
            userId,
            amount: premiumPost.price,
            transactionId,
            platformFee,
            charityAmount,
            creatorAmount,
            status: "COMPLETED",
          },
        }),
        prisma.creatorProfile.update({
          where: { id: premiumPost.creatorProfileId },
          data: {
            totalPremiumRevenue: { increment: premiumPost.price },
            totalEarnings: { increment: creatorAmount },
            balance: { increment: creatorAmount },
          },
        }),
        prisma.premiumPost.update({
          where: { id: premiumPostId },
          data: {
            totalPurchases: { increment: 1 },
            totalRevenue: { increment: premiumPost.price },
          },
        }),
      ]);
    } catch (err: any) {
      if (err?.code === "P2002") {
        return NextResponse.json(
          { error: "This transaction has already been used for a payment." },
          { status: 400 }
        );
      }
      throw err;
    }

    // ─── Create notification for creator (without content) ──────
    await prisma.notification.create({
      data: {
        userId: premiumPost.creatorProfile.userId,
        fromUserId: userId,
        type: "PURCHASE",
        // No 'content' field: the frontend will display based on type and fromUserId
      },
    });

    return jsonWithDecimals({
      purchase,
      message: "Purchase successful! You can now view the full post.",
    });
  } catch (error) {
    console.error("Purchase premium post error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
