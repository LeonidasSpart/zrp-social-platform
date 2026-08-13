import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { sendPushNotification } from "@/lib/push-notifications";
import { rateLimit } from "@/lib/rate-limit";

// ─── GET: Fetch a page of threaded comments with counts and status ──
// Paginates by top-level comment (cursor + limit), then loads only the
// reply subtrees belonging to that page's threads - not every comment on
// the post. This avoids one giant query/payload on posts with thousands
// of comments while keeping full nested reply threads intact.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const postId = params.id;
    const session = await getServerSession(authOptions);
    const viewerId = session?.user?.id;

    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") || "10", 10) || 10, 50);

    // ─── Check if comments are enabled for this post ────────────────
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { commentsEnabled: true },
    });

    // If post not found or comments disabled, return empty page
    if (!post || post.commentsEnabled === false) {
      return NextResponse.json({ comments: [], nextCursor: null });
    }

    const authorSelect = {
      id: true,
      username: true,
      name: true,
      avatarUrl: true,
      badgeType: true,
    } as const;
    const countSelect = {
      _count: { select: { likes: true, reposts: true, bookmarks: true } },
    } as const;

    // ─── Page of top-level threads (newest first) ────────────────────
    const topLevelPage = await prisma.comment.findMany({
      where: { postId, parentId: null },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      include: { author: { select: authorSelect }, ...countSelect },
    });

    let nextCursor: string | null = null;
    if (topLevelPage.length > limit) {
      const next = topLevelPage.pop();
      nextCursor = next!.id;
    }

    // ─── BFS down the reply tree, but only for this page's threads ───
    const allComments: any[] = [...topLevelPage];
    let frontier = topLevelPage.map((c) => c.id);
    while (frontier.length > 0) {
      const children = await prisma.comment.findMany({
        where: { parentId: { in: frontier } },
        orderBy: { createdAt: "asc" },
        include: { author: { select: authorSelect }, ...countSelect },
      });
      if (children.length === 0) break;
      allComments.push(...children);
      frontier = children.map((c) => c.id);
    }

    // ─── Build the comment tree from this page's comments only ──────
    const commentMap = new Map();
    allComments.forEach((comment) => {
      commentMap.set(comment.id, { ...comment, replies: [] });
    });
    allComments.forEach((comment) => {
      if (comment.parentId) {
        const parent = commentMap.get(comment.parentId);
        if (parent) parent.replies.push(commentMap.get(comment.id));
      }
    });
    const topLevelComments = topLevelPage.map((c) => commentMap.get(c.id));

    // ─── Add liked / reposted / bookmarked status for the viewer ──
    if (viewerId) {
      const allCommentIds = allComments.map((c) => c.id);

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

    return NextResponse.json({ comments: topLevelComments, nextCursor });
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
  // Rate limit: 30 comments per 5 minutes - generous for active
  // conversations, blocks comment-flooding/spam scripts.
  const limit = await rateLimit(req, { limit: 30, window: 300, type: "comment-create" });
  if (!limit.success) return limit.response;

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
