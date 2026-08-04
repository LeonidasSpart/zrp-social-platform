import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Get users the current user follows
  const following = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  });
  const followedIds = following.map(f => f.followingId);

  // Also include the current user's own stories
  const userIds = [userId, ...followedIds];

  // Fetch active stories (not expired)
  const now = new Date();
  const stories = await prisma.story.findMany({
    where: {
      userId: { in: userIds },
      expiresAt: { gt: now },
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          name: true,
          avatarUrl: true,
        },
      },
      views: {
        where: { viewerId: userId },
        select: { id: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Group stories by user
  const grouped: Record<string, any> = {};
  stories.forEach((story) => {
    const userKey = story.userId;
    if (!grouped[userKey]) {
      grouped[userKey] = {
        user: story.user,
        stories: [],
      };
    }
    grouped[userKey].stories.push({
      id: story.id,
      content: story.content,
      mediaUrl: story.mediaUrl,
      mediaType: story.mediaType,
      createdAt: story.createdAt,
      viewed: story.views.length > 0,
    });
  });

  return NextResponse.json(Object.values(grouped));
}
