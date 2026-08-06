import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { sendPushNotification } from "@/lib/push-notifications";

// ─── GET: Fetch threaded comments with counts and user status ──────
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const postId = params.id;
    const session = await getServerSession(authOptions);
    const viewerId = session?.user?.id;

    // ─── Check if comments are enabled for this post ────────────────
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { commentsEnabled: true },
    });

    // If post not found or comments disabled, return empty array
    if (!post || post.commentsEnabled === false) {
      return NextResponse.json([]);
    }

    // ─── Fetch all comments for this post (including replies) ──────
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
        _count: {
          select: {
            likes: true,
            reposts: true,
            bookmarks: true,
          },
        },
      },
    });

    // ─── Build a comment tree ──────────────────────────────────────
    const commentMap = new Map();
    const topLevelComments: any[] = [];

    comments.forEach((comment) => {
      const withReplies = { ...comment, replies: [] };
      commentMap.set(comment.id, withReplies);
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

    // ─── Sort top‑level comments (newest first) ────────────────────
    topLevelComments.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // ─── Sort replies (oldest first, threaded order) ──────────────
    topLevelComments.forEach((comment) => {
      comment.replies.sort(
        (a: any, b: any) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    });

    // ─── Add liked / reposted / bookmarked status for the viewer ──
    if (viewerId) {
      const allCommentIds: string[] = [];
      const collectIds = (commentsArray: any[]) => {
        commentsArray.forEach((c) => {
          allCommentIds.push(c.id);
          if (c.replies) collectIds(c.replies);
        });
      };
      collectIds(topLevelComments);

      const [likes, reposts, bookmarks] = await Promise.all([
        prisma.commentLike.findMany({
          where: { commentId: { in: allCommentIds }, userId: viewerId },
          select: { commentId: true },
        }),
        prisma.commentRepost.findMany({
          where: { commentId: { in: allCommentIds }, userId: viewerId },
          select: { commentId: true },
        }),
        prisma.commentBookmark.findMany({
          where: { commentId: { in: allCommentIds }, userId: viewerId },
          select: { commentId: true },
        }),
      ]);

      const likedIds = new Set(likes.map((l) => l.commentId));
      const repostedIds = new Set(reposts.map((r) => r.commentId));
      const bookmarkedIds = new Set(bookmarks.map((b) => b.commentId));

      const addStatus = (commentsArray: any[]) => {
        commentsArray.forEach((c) => {
          c.liked = likedIds.has(c.id);
          c.reposted = repostedIds.has(c.id);
          c.bookmarked = bookmarkedIds.has(c.id);
          if (c.replies) addStatus(c.replies);
        });
      };
      addStatus(topLevelComments);
    }

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

    // ─── Check if comments are enabled for this post ────────────────
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { commentsEnabled: true },
    });

    if (!post || post.commentsEnabled === false) {
      return NextResponse.json(
        { error: "Comments are disabled for this post." },
        { status: 403 }
      );
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
        _count: {
          select: {
            likes: true,
            reposts: true,
            bookmarks: true,
          },
        },
      },
    });

    // ─── Get post author for notification ──────────────────────────
    const postAuthor = await prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true },
    });

    // ─── Send notification (if not the author) ──────────────────────
    if (postAuthor && postAuthor.authorId !== session.user.id) {
      await createNotification({
        userId: postAuthor.authorId,
        type: "comment",
        fromUserId: session.user.id,
        postId: postId,
      });

      await sendPushNotification(
        postAuthor.authorId,
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
