import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { verifyUsdcTransaction } from "@/lib/solana";
import { rateLimit } from "@/lib/rate-limit";

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
    // more than one payment record - without this check, the same
    // on-chain transfer could be replayed against both a tip and a
    // premium purchase (or resubmitted after a failed request) to claim
    // credit twice. The per-table @@unique on transactionId only stops
    // reuse *within* the same table.
    const [reusedAsPurchase, reusedAsTip] = await Promise.all([
      prisma.premiumPurchase.findUnique({ where: { transactionId } }),
      prisma.tip.findUnique({ where: { transactionId } }),
    ]);
    if (reusedAsPurchase || reusedAsTip) {
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

    if (verification.amount + AMOUNT_EPSILON < premiumPost.price) {
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

    // Calculate fees
    const platformFee = premiumPost.price * PLATFORM_FEE;
    const charityAmount = platformFee * CHARITY_PERCENTAGE;
    const creatorAmount = premiumPost.price - platformFee;

    // Create the purchase record and credit the creator atomically - and
    // let the DB's unique constraint on transactionId be the final,
    // race-proof guard against double-spending the same signature (two
    // concurrent requests could both pass the reuse check above before
    // either has written its row).
    let purchase;
    try {
      [purchase] = await prisma.$transaction([
        prisma.premiumPurchase.create({
          data: {
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
        // No 'content' field – the frontend will display based on type and fromUserId
      },
    });

    return NextResponse.json({
      purchase,
      message: "Purchase successful! You can now view the full post.",
    });
  } catch (error) {
    console.error("Purchase premium post error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
