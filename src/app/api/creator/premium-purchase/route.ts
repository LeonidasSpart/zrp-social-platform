import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";

const PLATFORM_FEE = 0.10;
const CHARITY_PERCENTAGE = 0.35;

export async function POST(req: NextRequest) {
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

    const premiumPost = await prisma.premiumPost.findUnique({
      where: { id: premiumPostId },
      include: { creatorProfile: true },
    });

    if (!premiumPost) {
      return NextResponse.json({ error: "Premium post not found." }, { status: 404 });
    }

    // Calculate fees
    const platformFee = premiumPost.price * PLATFORM_FEE;
    const charityAmount = platformFee * CHARITY_PERCENTAGE;
    const creatorAmount = premiumPost.price - platformFee;

    // Create purchase – use "COMPLETED" (uppercase)
    const purchase = await prisma.premiumPurchase.create({
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
    });

    // Update creator earnings
    await prisma.creatorProfile.update({
      where: { id: premiumPost.creatorProfileId },
      data: {
        totalPremiumRevenue: { increment: premiumPost.price },
        totalEarnings: { increment: creatorAmount },
        balance: { increment: creatorAmount },
      },
    });

    // Update premium post stats
    await prisma.premiumPost.update({
      where: { id: premiumPostId },
      data: {
        totalPurchases: { increment: 1 },
        totalRevenue: { increment: premiumPost.price },
      },
    });

    // Create notification for creator
    const buyer = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, name: true },
    });

    await prisma.notification.create({
      data: {
        userId: premiumPost.creatorProfile.userId,
        fromUserId: userId,
        type: "PURCHASE",
        content: `${buyer?.name || buyer?.username} purchased your premium post.`,
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
