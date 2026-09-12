import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCached, setCached } from "@/lib/redis";
import { viewablePostAuthorFilter } from "@/lib/permissions";

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

// "Trending" (the Explore tab of that name) is a genuinely different
// ranking from "For You", not the same feed relabeled: raw engagement
// over a fixed recent window, no age decay. A post that is a day old
// with heavy engagement stays trending even though the age-decayed
// "For You" score would have buried it under everything posted in the
// last hour. Same 200-candidate pool and post shape either way.
const TRENDING_WINDOW_HOURS = 48;

function calculateTrendingScore(post: any) {
  const likes = post._count?.likes || 0;
  const comments = post._count?.comments || 0;
  const reposts = post._count?.reposts || 0;
  return likes + comments * 2 + reposts * 3;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    const { searchParams } = new URL(req.url);
    const sort = searchParams.get("sort") === "trending" ? "trending" : "forYou";
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
    // Bumped v6 -> v7: now also selects isPoll/poll (see L3 in
    // ios-native/PARITY.md - this route never selected poll data at
    // all, so a poll post reaching For You rendered with no poll,
    // indistinguishable from a post that never had one, on every
    // client). Only the poll's shared/aggregate fields are cached here,
    // deliberately excluding votes_user for the same reason `liked`
    // above isn't cached: the viewer's own vote must never wait out the
    // 5-minute cache window to show up.
    const cacheKey = `explore:${userId || 'anon'}:${sort}:v7`;
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
          author: viewablePostAuthorFilter(userId),
          ...(sort === "trending"
            ? { createdAt: { gte: new Date(Date.now() - TRENDING_WINDOW_HOURS * 60 * 60 * 1000) } }
            : {}),
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
          isPoll: true,
          poll: {
            select: {
              id: true,
              question: true,
              options: true,
              votes: true,
              expiresAt: true,
            },
          },
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
      const scoreFn = sort === "trending" ? calculateTrendingScore : calculateScore;
      ranked = posts
        .map((post) => ({
          ...post,
          score: scoreFn(post),
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

    // ─── Add the viewer's own poll vote for this page only (always
    // fresh, never cached - same reasoning as `liked` above) ──────────
    if (userId && page.length > 0) {
      const pollIds = page
        .filter((p: any) => p.poll)
        .map((p: any) => p.poll.id);
      if (pollIds.length > 0) {
        const votes = await prisma.pollVote.findMany({
          where: { userId, pollId: { in: pollIds } },
          select: { pollId: true, optionIndex: true },
        });
        const votesByPoll = new Map(votes.map(v => [v.pollId, v]));
        page.forEach((p: any) => {
          if (p.poll) {
            const vote = votesByPoll.get(p.poll.id);
            // Same raw shape GET /api/posts?tab=following already
            // returns - an array of the viewer's own vote row(s) - so
            // every client's existing poll-parsing code handles this
            // response exactly like it already handles that one.
            p.poll.votes_user = vote ? [{ optionIndex: vote.optionIndex }] : [];
          }
        });
      }
    }

    return NextResponse.json({ posts: page, nextCursor });
  } catch (error) {
    console.error("Explore error:", error);
    return NextResponse.json({ error: "Failed to fetch explore posts" }, { status: 500 });
  }
}
