/**
 * DiscoverRankingService
 * ============================================================
 *
 * A simple, explainable V1 ranking - no machine learning, no personal
 * behavioral model. Every score is reproducible from data already on
 * the Post row (its engagement counts + createdAt), so it's easy to
 * reason about, test, and explain in a takedown/appeal conversation if
 * a creator ever asks "why did my post rank where it did".
 *
 * Signal weights, in order of intended influence:
 *   - freshness: engagement is divided by age in hours (same
 *     age-decay shape /api/posts/explore's own `calculateScore`
 *     already uses for its "For You" ranking - reused here rather than
 *     inventing a second decay curve), so a new post with modest
 *     engagement can still surface above an old post with more absolute
 *     engagement.
 *   - reposts > comments > likes > saves, same relative ordering
 *     /api/posts/explore already established for "higher-effort
 *     engagement counts for more".
 *   - views uses log1p(views), NOT raw views - directive requirement
 *     "do not allow raw view count alone to dominate ranking". A post
 *     with 100x the views of another gets meaningfully more score, but
 *     nowhere near 100x, so view count alone can't permanently bury
 *     everything else the way a linear weight would.
 *
 * Isolated behind this one function specifically so it can be swapped
 * for a richer implementation later (watch time, completion rate, skip
 * rate, follows-after-view, language/interest personalization - see
 * "Future ranking evolution" in docs/discover-backend.md) without
 * touching the API contract, the candidate service, or the diversity
 * pass - only this function's internals change.
 */

import type { DiscoverCandidatePost, ScoredDiscoverPost } from "./types";

const LIKE_WEIGHT = 1;
const COMMENT_WEIGHT = 2;
const REPOST_WEIGHT = 3;
const SAVE_WEIGHT = 2;
const VIEW_WEIGHT = 1;

// Floors the age used in the freshness divisor at ~3.6 seconds, so a
// just-published post doesn't produce a divide-by-near-zero score that
// would otherwise dwarf everything else in the pool.
const MIN_AGE_HOURS = 0.001;

export function scoreCandidate(post: DiscoverCandidatePost, now: number = Date.now()): number {
  const { likes, comments, reposts, bookmarks } = post._count;

  const engagement =
    likes * LIKE_WEIGHT +
    comments * COMMENT_WEIGHT +
    reposts * REPOST_WEIGHT +
    bookmarks * SAVE_WEIGHT +
    Math.log1p(Math.max(0, post.views)) * VIEW_WEIGHT;

  const ageHours = Math.max(MIN_AGE_HOURS, (now - post.createdAt.getTime()) / (1000 * 60 * 60));

  return engagement / ageHours;
}

// A post surfaces into a ranked page for exactly one of two reasons,
// given score = engagement / ageHours: it's new enough that freshness
// is carrying it (the age divisor is still small), or it's old enough
// that it could only have ranked this high on real engagement (the age
// divisor is already large, so the numerator must be too). This
// threshold is the boundary "Why am I seeing this?" uses to pick
// between t("discover.reasonRecent") and t("discover.reasonPopular") -
// never a third, fabricated reason (no follow/watch-history signal
// exists in scoreCandidate() to honestly claim either of those).
const RECENT_REASON_THRESHOLD_HOURS = 6;

export type DiscoverReason = "recent" | "popular";

export function getDiscoverReason(post: DiscoverCandidatePost, now: number = Date.now()): DiscoverReason {
  // Unlike scoreCandidate (only ever called on fresh-from-Postgres rows,
  // before getOrderedFeedList caches them), this runs in toFeedItem
  // AFTER a possible Redis round-trip - getCached's JSON.parse leaves
  // createdAt as a string, not a Date, even though ScoredDiscoverPost's
  // type still claims Date. `new Date(...)` accepts both.
  const ageHours = (now - new Date(post.createdAt).getTime()) / (1000 * 60 * 60);
  return ageHours < RECENT_REASON_THRESHOLD_HOURS ? "recent" : "popular";
}

/**
 * Scores every candidate and stable-sorts descending. Array.prototype.sort
 * in every JS engine ZRP runs on is a stable sort, so candidates that tie
 * on score keep the DB's own `createdAt desc` order rather than being
 * reshuffled unpredictably - part of what keeps a page's ordering
 * deterministic across otherwise-identical requests.
 */
export function rankCandidates(candidates: DiscoverCandidatePost[]): ScoredDiscoverPost[] {
  const now = Date.now();
  return candidates
    .map((post) => ({ ...post, score: scoreCandidate(post, now) }))
    .sort((a, b) => b.score - a.score);
}
