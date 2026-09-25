import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { rateLimit } from "@/lib/rate-limit";
import { findVisiblePost } from "@/lib/post-visibility";

function isPrismaCode(err: unknown, code: string): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  // Rate limit: 120 bookmark-toggles per minute
  const limit = await rateLimit(req, { limit: 120, window: 60, type: "comment-bookmark" });
  if (!limit.success) return limit.response;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const commentId = params.id;
  const userId = session.user.id;

  try {
    const existing = await prisma.commentBookmark.findUnique({
      where: {
        commentId_userId: {
          commentId,
          userId,
        },
      },
    });

    if (existing) {
      try {
        await prisma.commentBookmark.delete({
          where: {
            commentId_userId: {
              commentId,
              userId,
            },
          },
        });
      } catch (err) {
        // A concurrent un-bookmark already removed it - same outcome.
        if (!isPrismaCode(err, "P2025")) throw err;
      }
      return NextResponse.json({ bookmarked: false });
    }

    // This used to create the row blind: an unknown/deleted comment id
    // failed the foreign key with an unhandled 500, and a double tap
    // raced into a unique-constraint 500 that made the client revert a
    // bookmark that had actually been saved. It also skipped the
    // parent post's visibility rule, and a comment bookmark carries its
    // parent post's content into GET /api/bookmarks.
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { postId: true },
    });
    if (!comment || !(await findVisiblePost(userId, comment.postId))) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    try {
      await prisma.commentBookmark.create({
        data: {
          commentId,
          userId,
        },
      });
    } catch (err) {
      if (!isPrismaCode(err, "P2002")) throw err;
    }
    return NextResponse.json({ bookmarked: true });
  } catch (error) {
    console.error("Comment bookmark error:", error);
    return NextResponse.json({ error: "Failed to toggle bookmark" }, { status: 500 });
  }
}
