import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getUserBookmarksPage } from "@/lib/bookmarks";
import { parseCursorParams } from "@/lib/pagination";

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

    return NextResponse.json({ items, nextCursor });
  } catch (error) {
    console.error("Error fetching bookmarks:", error);
    return NextResponse.json({ error: "Failed to fetch bookmarks" }, { status: 500 });
  }
}
