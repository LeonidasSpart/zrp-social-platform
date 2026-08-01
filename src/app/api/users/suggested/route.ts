import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get users that the current user is not following, excluding themselves
    const followed = await prisma.follow.findMany({
      where: { followerId: session.user.id },
      select: { followingId: true },
    });
    const followedIds = followed.map(f => f.followingId);

    const suggestions = await prisma.user.findMany({
      where: {
        id: {
          notIn: [session.user.id, ...followedIds],
        },
      },
      select: {
        id: true,
        username: true,
        name: true,
        avatarUrl: true,
        badgeType: true,
      },
      orderBy: {
        followers: { _count: "desc" },
      },
      take: 10,
    });

    return NextResponse.json(suggestions);
  } catch (error) {
    console.error("Suggested users error:", error);
    return NextResponse.json({ error: "Failed to fetch suggestions" }, { status: 500 });
  }
}
