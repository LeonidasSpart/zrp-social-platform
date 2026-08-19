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

    const followers = await prisma.follow.findMany({
      where: { followingId: user.id },
      include: {
        follower: {
          select: {
            id: true,
            username: true,
            name: true,
            avatarUrl: true,
            bio: true,
            badgeType: true,
          },
        },
      },
    });

    let isFollowingMap = new Map();
    if (session && session.user) {
      const following = await prisma.follow.findMany({
        where: {
          followerId: session.user.id,
          followingId: { in: followers.map((f) => f.follower.id) },
        },
      });
      following.forEach((f) => isFollowingMap.set(f.followingId, true));
    }

    const result = followers.map((f) => ({
      ...f.follower,
      isFollowing: isFollowingMap.has(f.follower.id) || false,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching followers:", error);
    return NextResponse.json({ error: "Failed to fetch followers" }, { status: 500 });
  }
}
