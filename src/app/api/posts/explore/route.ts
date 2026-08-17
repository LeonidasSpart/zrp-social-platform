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

    const { searchParams } = new URL(req.url);
    const cursorParam = searchParams.get("cursor");
    // Cursor here is a numeric offset into the ranked list, since ranking
    // is score-based (engagement/age), not something a DB cursor can walk
    // directly. The ranked list itself is cached so the offset stays
    // consistent across pages within the cache window.
    const offset = cursorParam ? Math.max(0, parseInt(cursorParam, 10) || 0) : 0;
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10) || 20, 50);

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

    // ─── Cache key (v5: caches the full ranked list, not just page 1,
    // and no longer bakes per-user liked status into the cached payload -
    // that's now computed fresh per request so a like/unlike is reflected
    // immediately instead of only after the 5-minute cache expires) ────
    // Bumped v5 -> v6: the cached shape now includes imageUrls/mediaType
    // (previously missing - see the select block below), so any cache
    // entry still keyed under v5 needs to be treated as a completely
    // different, stale entry rather than naturally expiring over the
    // next 5 minutes.
    const cacheKey = `explore:${userId || 'anon'}:v6`;
    let ranked: any[] | null = await getCached(cacheKey);

    if (!ranked) {
      // ─── Fetch a wider candidate pool so pagination has real depth ──
      const posts = await prisma.post.findMany({
        take: 200,
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
          // imageUrls (plural, the multi-image array) was missing here
          // entirely - this is the route the default "For You" tab
          // actually calls (page.tsx uses /api/posts/explore for
          // "for-you" and only /api/posts for "following"), so every
          // post returned here always had imageUrls undefined,
          // regardless of how many images it actually had. PostCard's
          // grid-vs-single-image check depends entirely on this field
          // being present, so it silently fell back to rendering just
          // the first image via the legacy singular imageUrl every time.
          imageUrls: true,
          mediaType: true,
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
              imageUrls: true,
              mediaType: true,
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
      ranked = posts
        .map((post) => ({
          ...post,
          score: calculateScore(post),
        }))
        .sort((a, b) => b.score - a.score);

      // ─── Cache the full ranked list for 5 minutes ────────────────────
      await setCached(cacheKey, ranked, 300);
    }

    const page = ranked.slice(offset, offset + limit);
    const nextCursor = offset + limit < ranked.length ? String(offset + limit) : null;

    // ─── Add liked status for this page only (always fresh, never cached) ──
    if (userId && page.length > 0) {
      const likes = await prisma.like.findMany({
        where: {
          userId: userId,
          postId: { in: page.map((p: any) => p.id) },
        },
        select: { postId: true },
      });
      const likedIds = new Set(likes.map(l => l.postId));
      page.forEach((p: any) => (p.liked = likedIds.has(p.id)));
    }

    return NextResponse.json({ posts: page, nextCursor });
  } catch (error) {
    console.error("Explore error:", error);
    return NextResponse.json({ error: "Failed to fetch explore posts" }, { status: 500 });
  }
}
