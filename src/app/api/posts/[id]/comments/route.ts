import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { sendPushNotification } from "@/lib/push-notifications";
import { rateLimit } from "@/lib/rate-limit";
import { checkPostLength } from "@/lib/limits";
import { canViewPrivateContent } from "@/lib/permissions";
import { notifyMentionedUsers } from "@/lib/mentions";
import { isBlockedEitherWay } from "@/lib/auth-guards";
import { isAllowedMediaUrl } from "@/lib/media-url";

// ─── GET: Fetch a page of threaded comments with counts and status ──
// Paginates by top-level comment (cursor + limit), then loads only the
// reply subtrees belonging to that page's threads - not every comment on
// the post. This avoids one giant query/payload on posts with thousands
// of comments while keeping full nested reply threads intact.
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
      select: {
        commentsEnabled: true,
        authorId: true,
        author: { select: { isPrivate: true } },
      },
    });

    // If post not found or comments disabled, return empty page
    if (!post || post.commentsEnabled === false) {
      return NextResponse.json({ comments: [], nextCursor: null });
    }

    // ─── Private accounts: only the owner or an approved follower ────
    if (!(await canViewPrivateContent(viewerId, post.authorId, post.author.isPrivate))) {
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
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  // Rate limit: 30 comments per 5 minutes - generous for active
  // conversations, blocks comment-flooding/spam scripts.
  const limit = await rateLimit(req, { limit: 30, window: 300, type: "comment-create" });
  if (!limit.success) return limit.response;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { content, parentId, imageUrl } = await req.json();
    const postId = params.id;

    // A comment may carry only an image (matching how a post/message is
    // allowed to be image-only) - content is only required when there is
    // no attachment.
    if (!content?.trim() && !imageUrl) {
      return NextResponse.json({ error: "Comment cannot be empty" }, { status: 400 });
    }

    // ⚠️ SECURITY: same rule as post/message media - a comment image must
    // come from ZRP's own upload storage or the GIF picker, never an
    // arbitrary client-supplied host or scheme. Comment.imageUrl already
    // existed in the schema and was already rendered by every comment UI;
    // no composer ever wrote to it, so this was previously unreachable
    // rather than unvalidated - still checked the same way regardless.
    if (imageUrl && !isAllowedMediaUrl(imageUrl)) {
      return NextResponse.json(
        { error: "Comment images must be uploaded through ZRP or chosen from the GIF picker." },
        { status: 400 }
      );
    }

    // Validate against the commenter's actual plan limit - previously
    // this had no server-side length check at all.
    const lengthCheck = checkPostLength((content?.length as number) || 0, (session.user as any).plan || "free");
    if (!lengthCheck.allowed) {
      return NextResponse.json({ error: lengthCheck.message }, { status: 400 });
    }

    // ─── Check if comments are enabled for this post ────────────────
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { commentsEnabled: true, authorId: true },
    });

    if (!post || post.commentsEnabled === false) {
      return NextResponse.json(
        { error: "Comments are disabled for this post." },
        { status: 403 }
      );
    }

    // ⚠️ SECURITY/PRIVACY: confirmed missing by audit - a blocked-either-way
    // relationship could still comment on the post, unlike follow/messages
    // which correctly block the interaction itself, not just the resulting
    // notification. Checked up front, before any comment is created.
    if (post.authorId !== session.user.id && (await isBlockedEitherWay(session.user.id, post.authorId))) {
      return NextResponse.json({ error: "Comments are disabled for this post." }, { status: 403 });
    }

    // ─── Validate parent comment if provided ────────────────────────
    let parentAuthorId: string | null = null;
    if (parentId) {
      const parent = await prisma.comment.findUnique({
        where: { id: parentId },
        select: { id: true, postId: true, authorId: true },
      });
      if (!parent) {
        return NextResponse.json({ error: "Parent comment not found" }, { status: 404 });
      }
      if (parent.postId !== postId) {
        return NextResponse.json({ error: "Parent comment does not belong to this post" }, { status: 400 });
      }
      if (
        parent.authorId !== session.user.id &&
        (await isBlockedEitherWay(session.user.id, parent.authorId))
      ) {
        return NextResponse.json({ error: "Comments are disabled for this post." }, { status: 403 });
      }
      parentAuthorId = parent.authorId;
    }

    // ─── Create comment ──────────────────────────────────────────────
    const comment = await prisma.comment.create({
      data: {
        content: content?.trim() || "",
        imageUrl: imageUrl || null,
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
      const notified = await createNotification({
        userId: postAuthor.authorId,
        type: "comment",
        fromUserId: session.user.id,
        postId: postId,
      });

      if (notified) {
        await sendPushNotification(
          postAuthor.authorId,
          "New Comment",
          `${session.user.name || session.user.username} commented on your post.`,
          `/post/${postId}`
        );
      }
    }

    // ─── Reply: also notify the parent comment's author ─────────────
    // Confirmed missing by audit - a reply only ever notified the post
    // author, never the person actually being replied to. Skipped when
    // that person already got the "comment" notification above (the
    // parent-comment author IS the post author) or is the replier
    // themself, so nobody gets two notifications for one action.
    if (
      parentAuthorId &&
      parentAuthorId !== session.user.id &&
      parentAuthorId !== postAuthor?.authorId
    ) {
      const notifiedReply = await createNotification({
        userId: parentAuthorId,
        type: "reply",
        fromUserId: session.user.id,
        postId: postId,
      });

      if (notifiedReply) {
        await sendPushNotification(
          parentAuthorId,
          "New Reply",
          `${session.user.name || session.user.username} replied to your comment.`,
          `/post/${postId}`
        );
      }
    }

    // ─── @mentions in the comment body ───────────────────────────────
    // Comments previously had no mention parsing at all (confirmed by
    // audit). Excludes whoever already got a "comment"/"reply"
    // notification above for this same comment, so mentioning the
    // person you're replying to doesn't also fire a redundant
    // "mentioned you" notification.
    await notifyMentionedUsers({
      content: content?.trim() || "",
      authorId: session.user.id,
      postId,
      excludeUserIds: [postAuthor?.authorId, parentAuthorId].filter(
        (id): id is string => !!id
      ),
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error("Comment error:", error);
    return NextResponse.json({ error: "Failed to post comment" }, { status: 500 });
  }
}
