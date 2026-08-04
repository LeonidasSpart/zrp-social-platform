import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// ─── GET: Fetch stories ──────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const following = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  });
  const followedIds = following.map((f) => f.followingId);
  const userIds = [userId, ...followedIds];

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

// ─── POST: Create a story ────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { content, mediaUrl, mediaType } = await req.json();

  // At least one of content or media must be provided
  if (!content && !mediaUrl) {
    return NextResponse.json(
      { error: "Please provide content or media" },
      { status: 400 }
    );
  }

  // Validate mediaType if mediaUrl is provided
  if (mediaUrl && !["image", "video"].includes(mediaType)) {
    return NextResponse.json(
      { error: "Invalid mediaType. Must be 'image' or 'video'." },
      { status: 400 }
    );
  }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  try {
    const story = await prisma.story.create({
      data: {
        userId: session.user.id,
        content: content || null,
        mediaUrl: mediaUrl || null,
        mediaType: mediaType || null,
        expiresAt,
      },
    });
    return NextResponse.json(story);
  } catch (error) {
    console.error("Story creation error:", error);
    return NextResponse.json(
      { error: "Failed to create story" },
      { status: 500 }
    );
  }
}
