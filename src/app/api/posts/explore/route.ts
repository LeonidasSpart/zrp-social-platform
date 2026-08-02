import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCached, setCached } from "@/lib/redis";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    // ─── Get blocked and muted users ──────────────────────────────
    let excludedAuthorIds: string[] = [];
    if (userId) {
      const [blocked, muted] = await Promise.all([
        prisma.blocked.findMany({
          where: { blockerId: userId },
          select: { blockedId: true },
        }),
        prisma.mute.findMany({
          where: { muterId: userId },
          select: { mutedId: true },
        }),
      ]);
      const blockedIds = blocked.map(b => b.blockedId);
      const mutedIds = muted.map(m => m.mutedId);
      excludedAuthorIds = [...blockedIds, ...mutedIds];
    }

    // ─── CHECK CACHE ───────────────────────────────────────────
    const cacheKey = `explore:${userId || 'anon'}`;
    const cached = await getCached(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // ─── FETCH FROM DATABASE ──────────────────────────────────
    const posts = await prisma.post.findMany({
      take: 20,
      orderBy: { createdAt: "desc" },
      where: {
        authorId: { notIn: excludedAuthorIds },
        status: "published", // ensure only published posts
      },
      select: {
        id: true,
        content: true,
        imageUrl: true,
        createdAt: true,
        views: true,

        author: {
          select: {
            id: true,
            username: true,
            name: true,
            avatarUrl: true,
            badgeType: true,
          },
        },
        // ✅ QUOTE REPOST – include the quoted post
        quotePost: {
          select: {
            id: true,
            content: true,
            imageUrl: true,
            createdAt: true,
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
      },
    });

    // ─── Sort by engagement ─────────────────────────────────────
    const sorted = posts.sort((a, b) => {
      const aEng = a._count.likes + a._count.comments + a._count.reposts;
      const bEng = b._count.likes + b._count.comments + b._count.reposts;
      return bEng - aEng;
    });

    // ─── Add liked status if logged in ──────────────────────────
    if (userId) {
      const likes = await prisma.like.findMany({
        where: {
          userId: userId,
          postId: { in: sorted.map(p => p.id) },
        },
        select: { postId: true },
      });
      const likedIds = new Set(likes.map(l => l.postId));
      sorted.forEach(p => (p as any).liked = likedIds.has(p.id));
    }

    // ─── CACHE FOR 1 MINUTE ───────────────────────────────────
    await setCached(cacheKey, sorted, 60);

    return NextResponse.json(sorted);
  } catch (error) {
    console.error("Explore error:", error);
    return NextResponse.json({ error: "Failed to fetch explore posts" }, { status: 500 });
  }
}
