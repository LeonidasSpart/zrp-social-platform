import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { rateLimit } from "@/lib/rate-limit";

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}
function isNotFound(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025";
}

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

  try {
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
      try {
        await prisma.commentLike.delete({
          where: {
            commentId_userId: {
              commentId,
              userId,
            },
          },
        });
      } catch (err) {
        if (!isNotFound(err)) throw err;
      }

      // Retract the notification this created - same reasoning as the
      // post-like route's unlike branch. "comment_like" is a distinct
      // type from the post "like" so this can never delete the wrong
      // notification for a post and a comment that happen to share a
      // postId.
      const comment = await prisma.comment.findUnique({
        where: { id: commentId },
        select: { postId: true },
      });
      if (comment) {
        await prisma.notification.deleteMany({
          where: { type: "comment_like", fromUserId: userId, postId: comment.postId, read: false },
        });
      }

      return NextResponse.json({ liked: false });
    } else {
      // Like
      try {
        await prisma.commentLike.create({
          data: {
            commentId,
            userId,
          },
        });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        return NextResponse.json({ liked: true });
      }

      // Send notification to comment author (if not self)
      const comment = await prisma.comment.findUnique({
        where: { id: commentId },
        select: { authorId: true, postId: true },
      });
      if (comment && comment.authorId !== userId) {
        await createNotification({
          userId: comment.authorId,
          type: "comment_like",
          fromUserId: userId,
          postId: comment.postId,
          // commentId removed: we don't have the field in Notification yet
        });
      }
      return NextResponse.json({ liked: true });
    }
  } catch (error) {
    console.error("Comment like error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
