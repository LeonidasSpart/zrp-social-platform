import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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
        commentId: commentId,
      });
    }
    return NextResponse.json({ liked: true });
  }
}
