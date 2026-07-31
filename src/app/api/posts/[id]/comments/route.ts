import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { sendPushNotification } from "@/lib/push-notifications";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const comments = await prisma.comment.findMany({
      where: { postId: params.id },
      orderBy: { createdAt: "asc" },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            name: true,
            avatarUrl: true,
            badgeType: true,
          },
        },
      },
    });
    return NextResponse.json(comments);
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { content } = await req.json();
    if (!content || content.trim().length === 0) {
      return NextResponse.json({ error: "Comment cannot be empty" }, { status: 400 });
    }

    // ─── Create comment ──────────────────────────────────────────────
    const comment = await prisma.comment.create({
      data: {
        content,
        postId: params.id,
        authorId: session.user.id,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            name: true,
            avatarUrl: true,
            badgeType: true,
          },
        },
      },
    });

    // ─── Get post author for notification ──────────────────────────
    const post = await prisma.post.findUnique({
      where: { id: params.id },
      select: { authorId: true },
    });

    // ─── Send notification (if not the author) ──────────────────────
    if (post && post.authorId !== session.user.id) {
      await createNotification({
        userId: post.authorId,
        type: "comment",
        fromUserId: session.user.id,
        postId: params.id,
      });

      await sendPushNotification(
        post.authorId,
        "New Comment",
        `${session.user.name || session.user.username} commented on your post.`,
        `/post/${params.id}`
      );
    }

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error("Comment error:", error);
    return NextResponse.json({ error: "Failed to post comment" }, { status: 500 });
  }
}
