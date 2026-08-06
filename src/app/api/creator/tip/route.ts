import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";

const PLATFORM_FEE = 0.10; // 10% platform fee
const CHARITY_PERCENTAGE = 0.35; // 35% of platform fee goes to charity

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const senderId = token.id as string;
    const body = await req.json();
    const { recipientId, amount, message, transactionId } = body;

    if (!recipientId || !amount || amount <= 0) {
      return NextResponse.json({ error: "Invalid tip details." }, { status: 400 });
    }

    if (senderId === recipientId) {
      return NextResponse.json({ error: "You cannot tip yourself." }, { status: 400 });
    }

    // Check recipient has creator profile and tips enabled
    const creatorProfile = await prisma.creatorProfile.findUnique({
      where: { userId: recipientId },
      include: { user: true },
    });

    if (!creatorProfile || !creatorProfile.tipsEnabled) {
      return NextResponse.json({ error: "This creator is not accepting tips." }, { status: 400 });
    }

    // Calculate fees
    const platformFee = amount * PLATFORM_FEE;
    const charityAmount = platformFee * CHARITY_PERCENTAGE;
    const creatorAmount = amount - platformFee;

    // Create tip record – use "COMPLETED" (uppercase)
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
        status: "COMPLETED", // ✅ fixed
      },
    });

    // Update creator profile balance and stats
    await prisma.creatorProfile.update({
      where: { id: creatorProfile.id },
      data: {
        totalTips: { increment: amount },
        totalEarnings: { increment: creatorAmount },
        balance: { increment: creatorAmount },
      },
    });

    // Create notification for creator
    const sender = await prisma.user.findUnique({
      where: { id: senderId },
      select: { username: true, name: true },
    });

    await prisma.notification.create({
      data: {
        userId: recipientId,
        fromUserId: senderId,
        type: "TIP",
        content: `${sender?.name || sender?.username} sent you a tip of ${amount} USDC${message ? `: "${message}"` : ""}`,
      },
    });

    return NextResponse.json({
      tip,
      message: "Tip sent successfully!",
    });
  } catch (error) {
    console.error("Tip error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
