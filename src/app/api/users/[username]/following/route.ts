import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest, props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);

    const user = await prisma.user.findUnique({
      where: { username: params.username },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const following = await prisma.follow.findMany({
      where: { followerId: user.id },
      include: {
        following: {
          select: {
            id: true,
            username: true,
            name: true,
            avatarUrl: true,
            bio: true,
            badgeType: true, // ✅ added
          },
        },
      },
    });

    let isFollowingMap = new Map();
    if (session && session.user) {
      const userFollowing = await prisma.follow.findMany({
        where: {
          followerId: session.user.id,
          followingId: { in: following.map((f) => f.following.id) },
        },
      });
      userFollowing.forEach((f) => isFollowingMap.set(f.followingId, true));
    }

    const result = following.map((f) => ({
      ...f.following,
      isFollowing: isFollowingMap.has(f.following.id) || false,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching following:", error);
    return NextResponse.json({ error: "Failed to fetch following" }, { status: 500 });
  }
}
