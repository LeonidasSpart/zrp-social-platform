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
            quotedBy: true, // count of quote reposts on this post
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
    if (session?.user) {
      const likes = await prisma.like.findMany({
        where: {
          userId: session.user.id,
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
