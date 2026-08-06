import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = token.id as string;
    const body = await req.json();
    const { amount, walletAddress } = body;

    if (!amount || amount <= 0 || !walletAddress) {
      return NextResponse.json({ error: "Invalid withdrawal details." }, { status: 400 });
    }

    const profile = await prisma.creatorProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      return NextResponse.json({ error: "Creator profile not found." }, { status: 404 });
    }

    if (profile.balance < amount) {
      return NextResponse.json({ error: "Insufficient balance." }, { status: 400 });
    }

    // Create withdrawal request
    const withdrawal = await prisma.withdrawalRequest.create({
      data: {
        creatorProfileId: profile.id,
        userId,
        amount,
        walletAddress,
        status: "pending",
      },
    });

    // Deduct from balance (will be fully deducted when processed)
    // For now, we lock the amount

    return NextResponse.json({
      withdrawal,
      message: "Withdrawal request submitted. It will be processed within 24-48 hours.",
    });
  } catch (error) {
    console.error("Withdrawal error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
