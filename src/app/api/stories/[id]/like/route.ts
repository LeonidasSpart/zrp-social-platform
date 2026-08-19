import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  // Rate limit: 120 like-toggles per minute - matches post/comment likes,
  // generous for fast tapping through stories, still blocks abuse.
  const limit = await rateLimit(req, { limit: 120, window: 60, type: "story-like" });
  if (!limit.success) return limit.response;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const storyId = params.id;
  const likerId = session.user.id;

  try {
    const existing = await prisma.storyLike.findUnique({
      where: {
        storyId_likerId: {
          storyId,
          likerId,
        },
      },
    });

    if (existing) {
      // Unlike
      await prisma.storyLike.delete({
        where: {
          storyId_likerId: {
            storyId,
            likerId,
          },
        },
      });
      return NextResponse.json({ liked: false });
    }

    // Like - the story must still exist (it may have expired/been
    // deleted between the viewer opening it and tapping the heart).
    const story = await prisma.story.findUnique({
      where: { id: storyId },
      select: { userId: true },
    });
    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    await prisma.storyLike.create({
      data: { storyId, likerId },
    });

    if (story.userId !== likerId) {
      await createNotification({
        userId: story.userId,
        type: "like",
        fromUserId: likerId,
        // No postId - this is a story like, not a post like. The
        // notification system's postId field is optional and only
        // used to build a link back to a post; omitting it is safe.
      });
    }

    return NextResponse.json({ liked: true });
  } catch (error) {
    console.error("Story like error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
