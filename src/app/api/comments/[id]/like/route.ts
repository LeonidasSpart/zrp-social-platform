import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  // Rate limit: 120 like-toggles per minute
  const limit = await rateLimit(req, { limit: 120, window: 60, type: "comment-like" });
  if (!limit.success) return limit.response;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const commentId = params.id;
  const userId = session.user.id;

  // Check if already liked
  const existing = await prisma.commentLike.findUnique({
    where: {
      commentId_userId: {
        commentId,
        userId,
      },
    },
  });

  if (existing) {
    // Unlike
    await prisma.commentLike.delete({
      where: {
        commentId_userId: {
          commentId,
          userId,
        },
      },
    });
    return NextResponse.json({ liked: false });
  } else {
    // Like
    await prisma.commentLike.create({
      data: {
        commentId,
        userId,
      },
    });
    // Send notification to comment author (if not self)
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { authorId: true, postId: true },
    });
    if (comment && comment.authorId !== userId) {
      await createNotification({
        userId: comment.authorId,
        type: "like",
        fromUserId: userId,
        postId: comment.postId,
        // commentId removed – we don't have the field in Notification yet
      });
    }
    return NextResponse.json({ liked: true });
  }
}
