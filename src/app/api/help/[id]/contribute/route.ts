export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { jsonWithDecimals } from "@/lib/serialize-decimal";

// Unlike Tip/PremiumPurchase, HELP contributions carry NO platform fee -
// this is deliberately not a revenue feature, so 100% of a verified
// contribution is credited to the campaign.

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Contribution verification does real RPC + DB work per call - cap
  // abuse, same reasoning as creator-tip.
  const limit = await rateLimit(req, { limit: 10, window: 60, type: "help-contribute" });
  if (!limit.success) return limit.response;

  const { id: campaignId } = await params;

  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const contributorId = token.id as string;

    const contributor = await prisma.user.findUnique({
      where: { id: contributorId },
      select: { verifiedSolanaWallet: true },
    });

    const body = await req.json();
    const { amount, message, isAnonymous, transactionId } = body;

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return NextResponse.json({ error: "Invalid contribution amount." }, { status: 400 });
    }
    if (!transactionId || typeof transactionId !== "string") {
      return NextResponse.json({ error: "Transaction ID is required." }, { status: 400 });
    }
    if (numericAmount > 1_000_000) {
      return NextResponse.json({ error: "Contribution amount is too large." }, { status: 400 });
    }

    const campaign = await prisma.helpCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.status !== "ACTIVE") {
      return NextResponse.json({ error: "This campaign isn't accepting contributions." }, { status: 400 });
    }
    if (!campaign.needTypes.includes("MONEY")) {
      return NextResponse.json({ error: "This campaign isn't requesting money." }, { status: 400 });
    }

    // Dedup: a signature may only ever credit one payment record across
    // the whole system - same guard as tip/premium-purchase, extended
    // to also cover HelpContribution.
    const [existingContribution, existingTip, existingPurchase] = await Promise.all([
      prisma.helpContribution.findUnique({ where: { transactionId } }),
      prisma.tip.findUnique({ where: { transactionId } }),
      prisma.premiumPurchase.findUnique({ where: { transactionId } }),
    ]);
    if (existingContribution || existingTip || existingPurchase) {
      return NextResponse.json({ error: "Transaction already processed." }, { status: 409 });
    }

    // Verify transaction on-chain. Dynamic import - see src/lib/solana.ts
    // for why (avoids a Next.js build-time evaluation crash).
    let verifiedAmount: number;
    let verifiedFrom: string | null = null;
    try {
      const { verifyUsdcTransaction } = await import("@/lib/solana");
      const result = await verifyUsdcTransaction(transactionId);
      if (!result || !result.valid) {
        return NextResponse.json({ error: "Invalid or pending transaction." }, { status: 400 });
      }

      verifiedAmount = Number(result.amount);
      verifiedFrom = result.from || null;
      if (!Number.isFinite(verifiedAmount) || verifiedAmount <= 0) {
        return NextResponse.json({ error: "Could not determine the verified transaction amount." }, { status: 400 });
      }

      // Never trust the amount sent by the browser.
      const difference = Math.abs(verifiedAmount - numericAmount);
      const tolerance = 0.000001; // USDC has 6 decimals
      if (difference > tolerance) {
        return NextResponse.json(
          {
            error: "Transaction amount does not match the contribution amount.",
            verifiedAmount,
            requestedAmount: numericAmount,
          },
          { status: 400 }
        );
      }

      // Bind the on-chain sender to the authenticated ZRP account - same
      // wallet-link enforcement as creator-tip.
      if (contributor?.verifiedSolanaWallet && verifiedFrom && verifiedFrom !== contributor.verifiedSolanaWallet) {
        return NextResponse.json(
          { error: "This transaction was sent from a wallet that isn't linked to your account." },
          { status: 400 }
        );
      }
    } catch (err: unknown) {
      console.error("HELP contribution verification error:", err);
      const errorMessage = err instanceof Error ? err.message : "Unknown transaction verification error";
      return NextResponse.json({ error: "Failed to verify transaction: " + errorMessage }, { status: 400 });
    }

    let contribution;
    try {
      [contribution] = await prisma.$transaction([
        prisma.helpContribution.create({
          data: {
            campaignId,
            contributorId,
            amount: numericAmount,
            message: typeof message === "string" ? message.slice(0, 1000) : null,
            isAnonymous: Boolean(isAnonymous),
            transactionId,
            status: "COMPLETED",
          },
        }),
        prisma.helpCampaign.update({
          where: { id: campaignId },
          data: {
            raisedAmount: { increment: numericAmount },
            balance: { increment: numericAmount },
          },
        }),
      ]);
    } catch (err: any) {
      if (err?.code === "P2002") {
        return NextResponse.json({ error: "Transaction already processed." }, { status: 409 });
      }
      throw err;
    }

    // No per-contribution notification to the organizer - a popular
    // campaign could generate a flood of them; the organizer sees
    // totals on their campaign dashboard instead.

    return jsonWithDecimals({
      success: true,
      contribution,
      message: "Thank you for your contribution!",
    });
  } catch (error) {
    console.error("HELP contribution error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
