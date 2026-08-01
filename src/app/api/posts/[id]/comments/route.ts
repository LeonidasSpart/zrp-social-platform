import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { sendPushNotification } from "@/lib/push-notifications";

// ─── GET: Fetch threaded comments ────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const postId = params.id;

    // Fetch all comments for this post (including parentId)
    const comments = await prisma.comment.findMany({
      where: { postId },
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
        // Include nested replies (one level deep – but we'll build the full tree)
        replies: {
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
        },
      },
    });

    // ─── Build a comment tree ──────────────────────────────────────
    const commentMap = new Map();
    const topLevelComments: any[] = [];

    comments.forEach((comment) => {
      // Add replies array to each comment
      const commentWithReplies = { ...comment, replies: [] };
      commentMap.set(comment.id, commentWithReplies);
    });

    comments.forEach((comment) => {
      if (comment.parentId) {
        const parent = commentMap.get(comment.parentId);
        if (parent) {
          parent.replies.push(commentMap.get(comment.id));
        }
      } else {
        topLevelComments.push(commentMap.get(comment.id));
      }
    });

    // Sort top-level comments newest first
    topLevelComments.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Sort replies oldest first (threaded order)
    topLevelComments.forEach((comment) => {
      comment.replies.sort(
        (a: any, b: any) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    });

    return NextResponse.json(topLevelComments);
  } catch (error) {
    console.error("Error fetching comments:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

// ─── POST: Create a comment (or reply) ──────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { content, parentId } = await req.json();
    const postId = params.id;

    if (!content?.trim()) {
      return NextResponse.json({ error: "Comment cannot be empty" }, { status: 400 });
    }

    // ─── Validate parent comment if provided ────────────────────────
    if (parentId) {
      const parent = await prisma.comment.findUnique({
        where: { id: parentId },
        select: { id: true, postId: true },
      });
      if (!parent) {
        return NextResponse.json({ error: "Parent comment not found" }, { status: 404 });
      }
      if (parent.postId !== postId) {
        return NextResponse.json({ error: "Parent comment does not belong to this post" }, { status: 400 });
      }
    }

    // ─── Create comment ──────────────────────────────────────────────
    const comment = await prisma.comment.create({
      data: {
        content: content.trim(),
        postId,
        authorId: session.user.id,
        parentId: parentId || null,
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
      where: { id: postId },
      select: { authorId: true },
    });

    // ─── Send notification (if not the author) ──────────────────────
    if (post && post.authorId !== session.user.id) {
      await createNotification({
        userId: post.authorId,
        type: "comment",
        fromUserId: session.user.id,
        postId: postId,
      });

      await sendPushNotification(
        post.authorId,
        "New Comment",
        `${session.user.name || session.user.username} commented on your post.`,
        `/post/${postId}`
      );
    }

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error("Comment error:", error);
    return NextResponse.json({ error: "Failed to post comment" }, { status: 500 });
  }
}
