import { applyGeoBoost } from "./geo-boost";

// ─── Shared post engagement/ranking formulas ─────────────────────────
// Extracted from GET /api/posts/explore (the original, reviewed home of
// this formula) so Advanced Search's "engagement"/"trending" sort can
// reuse the exact same, already-shipped ranking instead of inventing a
// second, divergent one. Both callers must see byte-identical scores
// for the same post - this is the single source of truth for both.

/** Weighted engagement: reposts > comments > likes. */
export function calculatePostEngagement(post: {
  _count?: { likes?: number; comments?: number; reposts?: number };
}): number {
  const likes = post._count?.likes || 0;
  const comments = post._count?.comments || 0;
  const reposts = post._count?.reposts || 0;
  return likes + comments * 2 + reposts * 3;
}

/**
 * Score = engagement / age_in_hours (capped to avoid Infinity), with a
 * modest same-country boost folded in - see ./geo-boost.ts for why this
 * is additive, not a filter.
 */
export function calculateScore(
  post: { _count?: { likes?: number; comments?: number; reposts?: number }; createdAt: Date | string; author?: { countryCode?: string | null } },
  viewerCountryCode: string | null
): number {
  const engagement = calculatePostEngagement(post);
  const ageMs = Date.now() - new Date(post.createdAt).getTime();
  // Minimum 0.001 hour (~3.6 seconds) to avoid division by zero.
  const ageHours = Math.max(0.001, ageMs / (1000 * 60 * 60));
  const baseScore = engagement / ageHours;
  return applyGeoBoost(baseScore, viewerCountryCode, post.author?.countryCode ?? null);
}

// Raw engagement over a fixed recent window, no age decay - a
// genuinely different ranking from calculateScore above, not the same
// feed relabeled. A post that is a day old with heavy engagement stays
// "trending" even though the age-decayed score would have buried it
// under everything posted in the last hour.
export const TRENDING_WINDOW_HOURS = 48;

export function calculateTrendingScore(post: {
  _count?: { likes?: number; comments?: number; reposts?: number };
}): number {
  return calculatePostEngagement(post);
}
