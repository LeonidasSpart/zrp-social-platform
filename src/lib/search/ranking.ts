import { TRENDING_WINDOW_DAYS_NON_POST } from "./constants";

/**
 * Generic "trending" formula for every category except Posts (which
 * reuses src/lib/feed/scoring.ts's own age-in-hours formula to stay
 * identical to the existing feed): a popularity counter decayed by age
 * in days, so a newer item accumulating the counter fast can outrank an
 * older, merely-more-popular one. `windowDays` only affects how
 * aggressively age decays the score, not which candidates are eligible
 * - eligibility (if any) is the caller's own WHERE clause.
 */
export function ageDecayedScore(
  counter: number,
  createdAt: Date,
  windowDays: number = TRENDING_WINDOW_DAYS_NON_POST
): number {
  const ageDays = Math.max(1 / 24, (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
  // windowDays sets the decay rate: a score at exactly `windowDays` old
  // has been halved relative to a brand-new item with the same counter.
  const halfLife = windowDays;
  return counter / Math.pow(2, ageDays / halfLife);
}

/**
 * "relevance" sort's combined key: text-match quality always dominates
 * (see text-match.ts) - the popularity counter is capped so it can
 * never bridge from one match tier into the next, and only breaks ties
 * among equally-good text matches.
 */
export function relevanceScore(textScore: number, engagementCounter: number): number {
  return textScore * 1_000_000 + Math.min(Math.max(engagementCounter, 0), 999_999);
}
