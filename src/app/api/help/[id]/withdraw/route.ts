export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { jsonWithDecimals } from "@/lib/serialize-decimal";

// Same atomic reserve-on-request pattern as creator/withdraw, applied
// to a campaign's pooled balance instead of a CreatorProfile's. Unlike
// creator withdrawals, this requires a verified, signature-linked
// wallet (see /api/wallet/link-challenge + link-verify) - donated
// public funds are held to a stricter bar than a creator's own
// earnings.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limit = await rateLimit(req, { limit: 5, window: 300, type: "help-withdraw" });
  if (!limit.success) return limit.response;

  const { id: campaignId } = await params;

  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const organizerId = token.id as string;

    const body = await req.json();
    const { amount } = body;

    if (!amount || typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Invalid withdrawal details." }, { status: 400 });
    }

    const [campaign, organizer] = await Promise.all([
      prisma.helpCampaign.findUnique({ where: { id: campaignId } }),
      prisma.user.findUnique({ where: { id: organizerId }, select: { verifiedSolanaWallet: true } }),
    ]);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (campaign.organizerId !== organizerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!organizer?.verifiedSolanaWallet) {
      return NextResponse.json(
        { error: "Link and verify a Solana wallet before withdrawing campaign funds." },
        { status: 400 }
      );
    }

    // ⚠️ SECURITY: atomic compare-and-swap reservation, same pattern as
    // creator/withdraw - the balance check lives inside the `where`
    // clause so two concurrent requests can't both pass a stale read.
    const reservation = await prisma.helpCampaign.updateMany({
      where: { id: campaignId, balance: { gte: amount } },
      data: { balance: { decrement: amount } },
    });
    if (reservation.count === 0) {
      return NextResponse.json({ error: "Insufficient campaign balance." }, { status: 400 });
    }

    let withdrawal;
    try {
      withdrawal = await prisma.helpWithdrawalRequest.create({
        data: {
          campaignId,
          organizerId,
          amount,
          walletAddress: organizer.verifiedSolanaWallet,
          status: "PENDING",
        },
      });
    } catch (err) {
      await prisma.helpCampaign.update({
        where: { id: campaignId },
        data: { balance: { increment: amount } },
      });
      throw err;
    }

    return jsonWithDecimals({
      withdrawal,
      message: "Withdrawal request submitted. It will be processed within 24-48 hours.",
    });
  } catch (error) {
    console.error("HELP withdrawal error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
