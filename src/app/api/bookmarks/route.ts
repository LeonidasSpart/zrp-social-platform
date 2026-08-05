import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = session.user.id;

    // ─── Fetch post bookmarks ──────────────────────────────────────
    const postBookmarks = await prisma.bookmark.findMany({
      where: { userId },
      include: {
        post: {
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
              select: { likes: true, comments: true, reposts: true, quotedBy: true }, // ✅ added quotedBy
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // ─── Fetch comment bookmarks ──────────────────────────────────
    const commentBookmarks = await prisma.commentBookmark.findMany({
      where: { userId },
      include: {
        comment: {
          include: {
            author: {
              select: {
                id: true,
                username: true,
                name: true,
                avatarUrl: true,
              },
            },
            post: {
              select: {
                id: true,
                content: true,
                author: {
                  select: {
                    username: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // ─── Add liked status to posts ────────────────────────────────
    const postIds = postBookmarks.map((b) => b.post.id);
    const likedPosts = await prisma.like.findMany({
      where: {
        userId: userId,
        postId: { in: postIds },
      },
    });
    const likedIds = new Set(likedPosts.map((l) => l.postId));

    // ─── Format response ───────────────────────────────────────────
    const formattedPosts = postBookmarks.map((b) => ({
      type: "post" as const,
      id: b.id,
      createdAt: b.createdAt,
      post: {
        ...b.post,
        liked: likedIds.has(b.post.id),
      },
    }));

    const formattedComments = commentBookmarks.map((b) => ({
      type: "comment" as const,
      id: b.id,
      createdAt: b.createdAt,
      comment: b.comment,
    }));

    // ─── Sort by creation date (newest first) ──────────────────────
    const allBookmarks = [...formattedPosts, ...formattedComments].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return NextResponse.json(allBookmarks);
  } catch (error) {
    console.error("Error fetching bookmarks:", error);
    return NextResponse.json({ error: "Failed to fetch bookmarks" }, { status: 500 });
  }
}
