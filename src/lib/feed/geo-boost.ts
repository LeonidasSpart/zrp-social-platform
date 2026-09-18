// ─── Geographic relevance signal for feed ranking ───────────────────
//
// One additive signal among several (recency, engagement) - never a
// filter, never the sole determinant, and never a country-only feed
// (see docs/user-geography-and-acquisition.md, Phase 9). A post from an
// author in the viewer's own country gets a modest score multiplier;
// everything else about ranking (engagement weighting, age decay,
// diversity) is untouched. SAME_COUNTRY_BOOST is deliberately small
// (15%) so a genuinely more engaging post from anywhere else still
// outranks a mediocre local one - this nudges content mix toward "more
// of what's happening near you" without recreating a country-only feed.
export const SAME_COUNTRY_BOOST = 1.15;

/**
 * Applies the same-country boost to an already-computed engagement/
 * recency score. `viewerCountryCode`/`authorCountryCode` are the
 * normalized ISO 3166-1 alpha-2 values (User.countryCode) - both must
 * be non-null and equal for the boost to apply; an unknown country on
 * either side never triggers it (no guessing).
 */
export function applyGeoBoost(
  baseScore: number,
  viewerCountryCode: string | null | undefined,
  authorCountryCode: string | null | undefined
): number {
  if (viewerCountryCode && authorCountryCode && viewerCountryCode === authorCountryCode) {
    return baseScore * SAME_COUNTRY_BOOST;
  }
  return baseScore;
}
