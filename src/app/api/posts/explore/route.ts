import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCached, setCached } from "@/lib/redis";
import { viewablePostAuthorFilter } from "@/lib/permissions";
import { applyPremiumGating } from "@/lib/premium-content";
import { applyGeoBoost } from "@/lib/feed/geo-boost";

export const dynamic = 'force-dynamic';

// ─── Score = engagement / age_in_hours (capped to avoid Infinity),
// with a modest same-country boost folded in - see
// src/lib/feed/geo-boost.ts for why this is additive, not a filter. ──
function calculateScore(post: any, viewerCountryCode: string | null) {
  const likes = post._count?.likes || 0;
  const comments = post._count?.comments || 0;
  const reposts = post._count?.reposts || 0;

  // Engagement weight: reposts > comments > likes
  const engagement = likes + comments * 2 + reposts * 3;

  const ageMs = Date.now() - new Date(post.createdAt).getTime();
  // Minimum 0.001 hour (~3.6 seconds) to avoid division by zero
  const ageHours = Math.max(0.001, ageMs / (1000 * 60 * 60));

  // New posts get a huge score, older posts get proportionally lower
  const baseScore = engagement / ageHours;
  return applyGeoBoost(baseScore, viewerCountryCode, post.author?.countryCode ?? null);
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
    // National trending (Phase 10): an explicit, opt-in scope on top of
    // "Trending", not a blend into its score - a viewer who doesn't ask
    // for it always sees the same global leaderboard as before. Only
    // meaningful for sort=trending; "For You" already carries the
    // same-country signal via calculateScore's modest boost instead.
    const scope = sort === "trending" && searchParams.get("scope") === "national" ? "national" : "global";
    const cursorParam = searchParams.get("cursor");
    // Cursor here is a numeric offset into the ranked list, since ranking
    // is score-based (engagement/age), not something a DB cursor can walk
    // directly. The ranked list itself is cached so the offset stays
    // consistent across pages within the cache window.
    const offset = cursorParam ? Math.max(0, parseInt(cursorParam, 10) || 0) : 0;
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10) || 20, 50);
    // "Refresh feed" (web's floating button/menu item, Android's pull-to-
    // refresh and its own floating button, iOS's pull-to-refresh) must be
    // able to see genuinely current content - a real post published a
    // minute ago must not stay invisible for up to 5 more minutes just
    // because this exact (userId, sort, scope) key was already cached.
    // Before this, an explicit refresh issued the identical request an
    // ordinary page load or pagination would, so it always hit the same
    // cache entry and could never see anything the cache didn't already
    // have - "Refresh feed" was a no-op until the TTL below happened to
    // expire on its own. `refresh=1` is a purely additive, opt-in signal:
    // a client that never sends it (including every existing client
    // build) gets byte-identical behavior to before, so this cannot
    // change the contract for anyone not using it. Only the cache READ
    // is skipped - the freshly recomputed ranking is still written back
    // under the same key below, so it also resets the TTL for whoever
    // reads this key next, rather than the refresh being wasted work.
    const forceRefresh = searchParams.get("refresh") === "1";

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
    // Bumped v7 -> v8: "For You" scoring now folds in the same-country
    // boost (author.countryCode), so a v7 entry cached before this
    // change would keep serving a ranking computed without it for up to
    // 5 minutes - treated as a distinct cache generation instead.
    const cacheKey = `explore:${userId || 'anon'}:${sort}:${scope}:v8`;
    // Cached as {ranked, scopeFallback} rather than a bare array so a
    // national-scope fallback decision (see below) survives a cache
    // hit too, not just the request that first computed it.
    const cachedEntry = forceRefresh
      ? null
      : await getCached<{ ranked: any[]; scopeFallback: boolean }>(cacheKey);
    let ranked: any[] | null = cachedEntry?.ranked ?? null;
    // Only true when a national-scope request had too little local
    // activity and fell back to the global leaderboard instead -
    // "insufficient data" per Phase 10, never a silently empty result.
    let scopeFallback = cachedEntry?.scopeFallback ?? false;

    if (!ranked) {
      // ⚠️ PERFORMANCE: only resolved on an actual cache miss, and only
      // when the ranking/filter logic below can actually use it - "For
      // You" scoring (calculateScore) and the national-scope filter.
      // This used to run unconditionally, before the cache lookup, on
      // EVERY request including cache hits (the common case for a
      // 5-minute-cached, per-user/sort/scope key) and for plain global
      // "Trending" (which never reads it at all) - one extra Postgres
      // round trip on the hottest read route in the app for no benefit
      // most of the time it ran. Never cached across users - the cache
      // key above is already scoped per userId, so a viewer's own
      // countryCode still can't leak into another viewer's cached list.
      const viewerCountryCode =
        userId && (sort !== "trending" || scope === "national")
          ? (await prisma.user.findUnique({ where: { id: userId }, select: { countryCode: true } }))
              ?.countryCode ?? null
          : null;

      const MIN_NATIONAL_CANDIDATES = 5;
      const nationalFilter =
        scope === "national" && viewerCountryCode ? { author: { countryCode: viewerCountryCode } } : {};

      // ─── Fetch a wider candidate pool so pagination has real depth ──
      const fetchCandidates = (countryFiltered: boolean) =>
        prisma.post.findMany({
          take: 200,
          orderBy: { createdAt: "desc" },
          where: {
            authorId: { notIn: excludedAuthorIds },
            status: "published",
            scheduledAt: null,
            author: {
              ...viewablePostAuthorFilter(userId),
              ...(countryFiltered ? nationalFilter.author : {}),
            },
            ...(sort === "trending"
              ? { createdAt: { gte: new Date(Date.now() - TRENDING_WINDOW_HOURS * 60 * 60 * 1000) } }
              : {}),
          },
          select: {
            id: true,
            authorId: true,
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
                countryCode: true,
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

      let posts = await fetchCandidates(scope === "national");
      if (scope === "national" && posts.length < MIN_NATIONAL_CANDIDATES) {
        // Not enough local activity to build a real national ranking -
        // fall back to the global candidate pool rather than showing a
        // near-empty or misleadingly thin "national trending" list.
        posts = await fetchCandidates(false);
        scopeFallback = true;
      }

      // ─── Compute scores and sort ─────────────────────────────────────
      // "Trending" deliberately stays a raw, unpersonalized engagement
      // leaderboard - no geo boost here. The same-country signal only
      // applies to "For You" (calculateScore); a distinct, explicit
      // national/local trending view is `?sort=trending&scope=national`
      // below, which filters the candidate pool instead of reweighting
      // this global one.
      const scoreFn =
        sort === "trending"
          ? (post: any) => calculateTrendingScore(post)
          : (post: any) => calculateScore(post, viewerCountryCode);
      ranked = posts
        .map((post) => ({
          ...post,
          score: scoreFn(post),
        }))
        .sort((a, b) => b.score - a.score);

      // ─── Cache the full ranked list for 5 minutes ────────────────────
      await setCached(cacheKey, { ranked, scopeFallback }, 300);
    }

    let page = ranked.slice(offset, offset + limit);
    const nextCursor = offset + limit < ranked.length ? String(offset + limit) : null;

    // ─── Add liked status and the viewer's own poll vote for this page
    // only (always fresh, never cached) ──────────────────────────────
    // These two lookups are fully independent - different tables,
    // different id sets, each only mutating its own field on `page` -
    // so they run concurrently instead of one waiting on the other.
    if (userId && page.length > 0) {
      const pollIds = page
        .filter((p: any) => p.poll)
        .map((p: any) => p.poll.id);

      const [likes, votes] = await Promise.all([
        prisma.like.findMany({
          where: {
            userId: userId,
            postId: { in: page.map((p: any) => p.id) },
          },
          select: { postId: true },
        }),
        pollIds.length > 0
          ? prisma.pollVote.findMany({
              where: { userId, pollId: { in: pollIds } },
              select: { pollId: true, optionIndex: true },
            })
          : Promise.resolve([]),
      ]);

      const likedIds = new Set(likes.map(l => l.postId));
      page.forEach((p: any) => (p.liked = likedIds.has(p.id)));

      if (pollIds.length > 0) {
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

    // ⚠️ SECURITY: redact pay-per-view content the viewer hasn't paid for
    // before it ever leaves the server - see src/lib/premium-content.ts.
    // The ranked list above is cached across viewers, so this must be
    // applied fresh per-request to this page slice, never baked into
    // the cached payload itself.
    page = await applyPremiumGating(page, userId);

    return NextResponse.json({ posts: page, nextCursor, scope, scopeFallback });
  } catch (error) {
    console.error("Explore error:", error);
    return NextResponse.json({ error: "Failed to fetch explore posts" }, { status: 500 });
  }
}
