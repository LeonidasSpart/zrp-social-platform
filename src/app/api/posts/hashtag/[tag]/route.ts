import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { viewablePostAuthorFilter } from "@/lib/permissions";
import { parseCursorParams, buildPage } from "@/lib/pagination";

export async function GET(req: NextRequest, props: { params: Promise<{ tag: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    const viewerId = session?.user?.id;

    // ─── Normalise the hashtag ──────────────────────────────────────
    const normalizedTag = params.tag.toLowerCase();

    // ─── Get excluded users (blocked + blockers + muted) ──────────
    let excludedAuthorIds: string[] = [];
    if (viewerId) {
      const [blocked, blockers, muted] = await Promise.all([
        prisma.blocked.findMany({
          where: { blockerId: viewerId },
          select: { blockedId: true },
        }),
        prisma.blocked.findMany({
          where: { blockedId: viewerId },
          select: { blockerId: true },
        }),
        prisma.mute.findMany({
          where: { muterId: viewerId },
          select: { mutedId: true },
        }),
      ]);
      excludedAuthorIds = [
        ...blocked.map(b => b.blockedId),
        ...blockers.map(b => b.blockerId),
        ...muted.map(m => m.mutedId),
      ];
    }

    const where = {
      hashtags: { has: normalizedTag },
      status: "published",
      scheduledAt: null,
      authorId: { notIn: excludedAuthorIds },
      author: viewablePostAuthorFilter(viewerId),
    };

    const include = {
      author: {
        select: {
          id: true,
          username: true,
          name: true,
          avatarUrl: true,
          badgeType: true,
        },
      },
      quotePost: {
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
              comments: true,
              reposts: true,
              quotedBy: true,
            },
          },
        },
      },
      _count: {
        select: {
          likes: true,
          comments: true,
          reposts: true,
          quotedBy: true,
        },
      },
    };

    // ─── Attach liked status for viewer ────────────────────────────
    const withLiked = async <T extends { id: string }>(fetchedPosts: T[]): Promise<T[]> => {
      if (!viewerId || fetchedPosts.length === 0) return fetchedPosts;
      const likes = await prisma.like.findMany({
        where: {
          userId: viewerId,
          postId: { in: fetchedPosts.map((p) => p.id) },
        },
        select: { postId: true },
      });
      const likedIds = new Set(likes.map((l) => l.postId));
      return fetchedPosts.map((p) => ({ ...p, liked: likedIds.has(p.id) }));
    };

    const { searchParams } = req.nextUrl;
    const usesPagination = searchParams.has("cursor") || searchParams.has("limit");

    if (!usesPagination) {
      // No client in the wild sends cursor/limit here today and every
      // one expects a bare JSON array - this keeps that exact contract
      // (including the historical 50-post cap) while the branch below
      // adds a real way to reach older posts under a popular hashtag,
      // the same "legacy shape vs. {items,nextCursor} envelope" bridge
      // already used by GET /api/messages/{userId}.
      const posts = await prisma.post.findMany({
        where,
        take: 50,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include,
      });
      return NextResponse.json(await withLiked(posts));
    }

    const { cursor, limit: pageSize } = parseCursorParams(req);
    const rawPosts = await prisma.post.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include,
    });

    const { items, nextCursor } = buildPage(rawPosts, pageSize);
    return NextResponse.json({ items: await withLiked(items), nextCursor });
  } catch (error) {
    console.error("Error fetching hashtag posts:", error);
    return NextResponse.json({ error: "Failed to fetch posts" }, { status: 500 });
  }
}
