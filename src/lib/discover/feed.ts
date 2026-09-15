/**
 * DiscoverFeedService
 * ============================================================
 *
 * Orchestrates the pipeline: DiscoverCandidateService (moderation/
 * privacy-safe candidate pool) -> DiscoverRankingService (score) ->
 * creator diversity -> pagination -> per-viewer state hydration ->
 * premium-content gating. No other module talks to the database for
 * feed retrieval directly - this is the one seam GET /api/discover
 * calls through.
 *
 * ─── Pagination model ──────────────────────────────────────────────
 * Discover's ordering is score-based, not a column the database can
 * walk with a plain id/createdAt cursor - the exact same situation
 * /api/posts/explore is already in, and this reuses its established
 * convention rather than inventing a new one: rank+diversify the whole
 * candidate pool ONCE, cache that ordered list briefly, and paginate
 * with a numeric offset cursor into the cached list. Every page is a
 * slice of the SAME underlying array for the cache's lifetime, so
 * pagination is trivially stable - no duplicate items, no skipped
 * items, deterministic ordering - for as long as the cache entry lives.
 * A cache miss (first request, or TTL expiry) recomputes the whole
 * ordered list from a fresh DB read; an in-flight pagination sequence
 * can therefore see a batch boundary shift if it straddles a recompute,
 * the same accepted tradeoff /api/posts/explore already makes for
 * exactly the same reason - see docs/discover-backend.md's "Known
 * limitations".
 *
 * ─── Redis is optional ─────────────────────────────────────────────
 * getCached/setCached (src/lib/redis.ts) already fail soft to "no
 * cache" when Redis is unavailable - every call here just falls
 * through to a fresh DB-backed recompute per request instead of
 * throwing or serving a blank page. Nothing below has a Redis-only
 * code path.
 */

import { prisma } from "@/lib/db";
import { getCached, setCached } from "@/lib/redis";
import { applyPremiumGating } from "@/lib/premium-content";
import { fetchCandidatePool } from "./candidates";
import { rankCandidates } from "./ranking";
import { diversifyByCreator } from "./diversity";
import type { DiscoverFeedItem, DiscoverFeedPage, ScoredDiscoverPost } from "./types";

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

// Short relative to /api/posts/explore's 5 minutes: Discover is meant
// to read as a live, frequently-refreshed surface (new Shorts appear
// quickly), and the candidate-pool query behind it is cheap (one
// indexed, take-200 query) compared to explore's broader "For You"
// candidate set, so a shorter TTL is affordable.
const CACHE_TTL_SECONDS = 45;

export function parseOffsetCursor(cursor: string | null): number {
  if (!cursor) return 0;
  const parsed = parseInt(cursor, 10);
  // An invalid/garbage cursor (non-numeric, negative) restarts the
  // feed from the top rather than erroring - the same forgiving
  // convention /api/posts/explore and /api/hashtags/search already use
  // for their own numeric offset cursors.
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function parseLimit(rawLimit: string | null): number {
  const parsed = parseInt(rawLimit || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

async function getOrderedFeedList(viewerId: string | null | undefined): Promise<ScoredDiscoverPost[]> {
  const cacheKey = `discover:feed:${viewerId || "anon"}:v1`;
  const cached = await getCached<ScoredDiscoverPost[]>(cacheKey);
  if (cached) return cached;

  const candidates = await fetchCandidatePool(viewerId);
  const ranked = rankCandidates(candidates);
  const diversified = diversifyByCreator(ranked);

  await setCached(cacheKey, diversified, CACHE_TTL_SECONDS);
  return diversified;
}

interface ViewerStateMaps {
  likedIds: Set<string>;
  savedIds: Set<string>;
  repostedIds: Set<string>;
  followedAuthorIds: Set<string>;
}

const EMPTY_VIEWER_STATE: ViewerStateMaps = {
  likedIds: new Set(),
  savedIds: new Set(),
  repostedIds: new Set(),
  followedAuthorIds: new Set(),
};

/**
 * Per-page, always-fresh viewer state (liked/saved/reposted/follows) -
 * deliberately never baked into the cached ranked list above, same
 * reasoning /api/posts/explore documents for why `liked` there is
 * computed fresh per request: a like/save/follow must show up
 * immediately, not wait out the cache TTL.
 */
async function hydrateViewerState(
  viewerId: string | null | undefined,
  page: ScoredDiscoverPost[]
): Promise<ViewerStateMaps> {
  if (!viewerId || page.length === 0) return EMPTY_VIEWER_STATE;

  const postIds = page.map((p) => p.id);
  const authorIds = Array.from(new Set(page.map((p) => p.authorId)));

  const [likes, bookmarks, reposts, follows] = await Promise.all([
    prisma.like.findMany({ where: { userId: viewerId, postId: { in: postIds } }, select: { postId: true } }),
    prisma.bookmark.findMany({ where: { userId: viewerId, postId: { in: postIds } }, select: { postId: true } }),
    prisma.repost.findMany({ where: { userId: viewerId, postId: { in: postIds } }, select: { postId: true } }),
    prisma.follow.findMany({
      where: { followerId: viewerId, followingId: { in: authorIds } },
      select: { followingId: true },
    }),
  ]);

  return {
    likedIds: new Set(likes.map((l) => l.postId)),
    savedIds: new Set(bookmarks.map((b) => b.postId)),
    repostedIds: new Set(reposts.map((r) => r.postId)),
    followedAuthorIds: new Set(follows.map((f) => f.followingId)),
  };
}

function toFeedItem(
  post: ScoredDiscoverPost & { premiumPost?: DiscoverFeedItem["premiumPost"] },
  viewerState: ViewerStateMaps
): DiscoverFeedItem {
  return {
    id: post.id,
    author: {
      id: post.author.id,
      username: post.author.username,
      name: post.author.name,
      avatarUrl: post.author.avatarUrl,
      badgeType: post.author.badgeType,
    },
    media: {
      // Never null by the time a post reaches here - fetchCandidatePool's
      // WHERE clause requires `imageUrl: { not: null }` and re-validates
      // with isRealVideoPost(), which itself requires a URL.
      url: post.imageUrl as string,
      type: "video",
    },
    caption: post.content,
    audio: null,
    stats: {
      likes: post._count.likes,
      comments: post._count.comments,
      reposts: post._count.reposts,
      saves: post._count.bookmarks,
      views: post.views,
    },
    viewerState: {
      liked: viewerState.likedIds.has(post.id),
      saved: viewerState.savedIds.has(post.id),
      reposted: viewerState.repostedIds.has(post.id),
      followsAuthor: viewerState.followedAuthorIds.has(post.authorId),
    },
    commentsEnabled: post.commentsEnabled,
    createdAt: new Date(post.createdAt).toISOString(),
    ...(post.premiumPost ? { premiumPost: post.premiumPost } : {}),
  };
}

export async function getDiscoverFeed(params: {
  viewerId: string | null | undefined;
  cursor: string | null;
  limit: number;
}): Promise<DiscoverFeedPage> {
  const { viewerId, cursor, limit } = params;

  const feedList = await getOrderedFeedList(viewerId);

  const offset = parseOffsetCursor(cursor);
  const rawPage = feedList.slice(offset, offset + limit);
  const nextCursor = offset + limit < feedList.length ? String(offset + limit) : null;

  if (rawPage.length === 0) {
    return { items: [], nextCursor };
  }

  // ⚠️ SECURITY: redact pay-per-view content the viewer hasn't paid for,
  // before anything else touches this page - see
  // src/lib/premium-content.ts. Applied fresh per request (the cached
  // ranked list above never carries gating decisions), matching every
  // other Post-serving route.
  const gatedPage = await applyPremiumGating(rawPage, viewerId);

  const viewerState = await hydrateViewerState(viewerId, rawPage);

  return {
    items: gatedPage.map((post) => toFeedItem(post, viewerState)),
    nextCursor,
  };
}
