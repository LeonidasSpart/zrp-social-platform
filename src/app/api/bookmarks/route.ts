import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getUserBookmarksPage } from "@/lib/bookmarks";
import { parseCursorParams } from "@/lib/pagination";
import { applyPremiumGating } from "@/lib/premium-content";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = session.user.id;
    const { cursor, limit } = parseCursorParams(req);
    const { items, nextCursor } = await getUserBookmarksPage(userId, cursor, limit);

    // ─── Add liked status to bookmarked posts ────────────────────────
    const postIds = items.filter((b) => b.post).map((b) => b.post!.id);
    if (postIds.length > 0) {
      const likedPosts = await prisma.like.findMany({
        where: { userId, postId: { in: postIds } },
        select: { postId: true },
      });
      const likedIds = new Set(likedPosts.map((l) => l.postId));
      items.forEach((b) => {
        if (b.post) {
          (b.post as any).liked = likedIds.has(b.post.id);
        }
      });
    }

    // ⚠️ SECURITY (N5): bookmarking a post never required purchasing it
    // (bookmarking and buying are independent actions), so this listing
    // returned a bookmarked premium post's full content/media to anyone
    // who'd bookmarked it, purchased or not. See src/lib/premium-content.ts.
    const bookmarkedPosts = items.filter((b) => b.post).map((b) => b.post!);
    if (bookmarkedPosts.length > 0) {
      const gatedById = new Map(
        (await applyPremiumGating(bookmarkedPosts, userId)).map((p) => [p.id, p])
      );
      items.forEach((b) => {
        if (b.post) {
          b.post = gatedById.get(b.post.id) as typeof b.post;
        }
      });
    }

    // ⚠️ SECURITY: a bookmarked COMMENT carries its parent post's
    // content too. Bookmarking a comment needs no purchase (comments on
    // a premium post are public), so this was a free read of any paid
    // post's full text. Same gate as above.
    const commentParentPosts = items.filter((b) => b.comment?.post).map((b) => b.comment!.post);
    if (commentParentPosts.length > 0) {
      const gatedParents = new Map(
        (await applyPremiumGating(commentParentPosts, userId)).map((p) => [p.id, p])
      );
      items.forEach((b) => {
        if (b.comment?.post) {
          b.comment.post = gatedParents.get(b.comment.post.id) as typeof b.comment.post;
        }
      });
    }

    return NextResponse.json({ items, nextCursor });
  } catch (error) {
    console.error("Error fetching bookmarks:", error);
    return NextResponse.json({ error: "Failed to fetch bookmarks" }, { status: 500 });
  }
}
