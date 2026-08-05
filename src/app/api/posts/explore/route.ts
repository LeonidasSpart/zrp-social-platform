import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCached, setCached } from "@/lib/redis";

export const dynamic = 'force-dynamic';

// ─── Score = engagement / age_in_hours (capped to avoid Infinity) ──
function calculateScore(post: any) {
  const likes = post._count?.likes || 0;
  const comments = post._count?.comments || 0;
  const reposts = post._count?.reposts || 0;

  // Engagement weight: reposts > comments > likes
  const engagement = likes + comments * 2 + reposts * 3;

  const ageMs = Date.now() - new Date(post.createdAt).getTime();
  // Minimum 0.001 hour (~3.6 seconds) to avoid division by zero
  const ageHours = Math.max(0.001, ageMs / (1000 * 60 * 60));

  // New posts get a huge score, older posts get proportionally lower
  return engagement / ageHours;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    // ─── Exclude blocked / muted users ──────────────────────────────
    let excludedAuthorIds: string[] = [];
    if (userId) {
      const [blocked, blockers, muted] = await Promise.all([
        prisma.blocked.findMany({
          where: { blockerId: userId },
          select: { blockedId: true },
        }),
        prisma.blocked.findMany({
          where: { blockedId: userId },
          select: { blockerId: true },
        }),
        prisma.mute.findMany({
          where: { muterId: userId },
          select: { mutedId: true },
        }),
      ]);
      const blockedIds = blocked.map(b => b.blockedId);
      const blockerIds = blockers.map(b => b.blockerId);
      const mutedIds = muted.map(m => m.mutedId);
      excludedAuthorIds = [...blockedIds, ...blockerIds, ...mutedIds];
    }

    // ─── Cache key ────────────────────────────────────────────────────
    const cacheKey = `explore:${userId || 'anon'}:v4`;
    const cached = await getCached(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // ─── Fetch recent posts ──────────────────────────────────────────
    const posts = await prisma.post.findMany({
      take: 50,
      orderBy: { createdAt: "desc" },
      where: {
        authorId: { notIn: excludedAuthorIds },
        status: "published",
        scheduledAt: null,
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

    // ─── Compute scores and sort ─────────────────────────────────────
    const ranked = posts
      .map((post) => ({
        ...post,
        score: calculateScore(post),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    // ─── Add liked status if logged in ──────────────────────────────
    if (userId && ranked.length > 0) {
      const likes = await prisma.like.findMany({
        where: {
          userId: userId,
          postId: { in: ranked.map(p => p.id) },
        },
        select: { postId: true },
      });
      const likedIds = new Set(likes.map(l => l.postId));
      ranked.forEach(p => (p as any).liked = likedIds.has(p.id));
    }

    // ─── Cache for 5 minutes ─────────────────────────────────────────
    await setCached(cacheKey, ranked, 300);

    return NextResponse.json(ranked);
  } catch (error) {
    console.error("Explore error:", error);
    return NextResponse.json({ error: "Failed to fetch explore posts" }, { status: 500 });
  }
}
