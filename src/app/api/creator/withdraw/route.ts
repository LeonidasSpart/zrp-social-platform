import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const limit = await rateLimit(req, { limit: 5, window: 300, type: "creator-withdraw" });
  if (!limit.success) return limit.response;

  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = token.id as string;
    const body = await req.json();
    const { amount, walletAddress } = body;

    if (!amount || typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Invalid withdrawal details." }, { status: 400 });
    }

    if (!walletAddress || typeof walletAddress !== "string") {
      return NextResponse.json({ error: "Invalid withdrawal details." }, { status: 400 });
    }

    const profile = await prisma.creatorProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      return NextResponse.json({ error: "Creator profile not found." }, { status: 404 });
    }

    // ⚠️ SECURITY: reserve the withdrawal amount atomically. The old
    // code checked `profile.balance < amount` and then created the
    // withdrawal request as a separate step - two concurrent requests
    // could both read the same balance, both pass the check, and both
    // get approved, over-committing funds the creator doesn't have.
    //
    // `updateMany` with the balance check baked into the `where` clause
    // is a compare-and-swap: the decrement only applies to a row that
    // still has at least `amount` available *at the moment the DB
    // executes it*, so only one of two racing requests can win.
    const reservation = await prisma.creatorProfile.updateMany({
      where: { id: profile.id, balance: { gte: amount } },
      data: { balance: { decrement: amount } },
    });

    if (reservation.count === 0) {
      return NextResponse.json({ error: "Insufficient balance." }, { status: 400 });
    }

    let withdrawal;
    try {
      withdrawal = await prisma.withdrawalRequest.create({
        data: {
          creatorProfileId: profile.id,
          userId,
          amount,
          walletAddress,
          status: "PENDING",
        },
      });
    } catch (err) {
      // The reservation succeeded but recording the request failed -
      // release the funds back rather than leaving them stuck in limbo.
      await prisma.creatorProfile.update({
        where: { id: profile.id },
        data: { balance: { increment: amount } },
      });
      throw err;
    }

    return NextResponse.json({
      withdrawal,
      message: "Withdrawal request submitted. It will be processed within 24-48 hours.",
    });
  } catch (error) {
    console.error("Withdrawal error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
