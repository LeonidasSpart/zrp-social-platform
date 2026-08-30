import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { jsonWithDecimals } from "@/lib/serialize-decimal";

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = token.id as string;

    const profile = await prisma.creatorProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      return NextResponse.json({ error: "Creator profile not found." }, { status: 404 });
    }

    // Get recent tips: use "COMPLETED" (uppercase)
    const recentTips = await prisma.tip.findMany({
      where: { recipientId: userId, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Get premium posts
    const premiumPosts = await prisma.premiumPost.findMany({
      where: { creatorProfileId: profile.id },
      orderBy: { createdAt: "desc" },
      include: {
        post: {
          select: {
            id: true,
            content: true,
            createdAt: true,
          },
        },
      },
    });

    // Get recent purchases: use "COMPLETED" (uppercase)
    const recentPurchases = await prisma.premiumPurchase.findMany({
      where: {
        premiumPost: {
          creatorProfileId: profile.id,
        },
        status: "COMPLETED",
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            avatarUrl: true,
          },
        },
        premiumPost: {
          select: {
            postId: true,
          },
        },
      },
    });

    return jsonWithDecimals({
      profile,
      recentTips,
      premiumPosts,
      recentPurchases,
      stats: {
        totalEarnings: profile.totalEarnings,
        balance: profile.balance,
        totalTips: profile.totalTips,
        totalPremiumRevenue: profile.totalPremiumRevenue,
        totalWithdrawn: profile.totalWithdrawn,
        totalPurchases: premiumPosts.reduce((sum, p) => sum + p.totalPurchases, 0),
      },
    });
  } catch (error) {
    console.error("Creator dashboard error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
