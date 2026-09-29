// Candidate pool size for score-based sorts (relevance/engagement/
// trending) across every category - mirrors GET /api/posts/explore's
// own 200-candidate-pool precedent, widened slightly since a search
// WHERE clause naturally matches fewer rows than a plain feed query, so
// a somewhat larger pool costs little extra work in practice.
export const CANDIDATE_POOL_SIZE = 300;

// Matches the 5-minute TTL convention GET /api/posts/explore and GET
// /api/hashtags/search already both use for their own cached ranked
// lists.
export const RANKED_CACHE_TTL_SECONDS = 300;

// "Trending" window for categories other than Posts (which reuses
// TRENDING_WINDOW_HOURS = 48 from src/lib/feed/scoring.ts to stay
// identical to the existing feed). Non-post content - jobs, listings,
// tracks, communities - doesn't churn hour to hour, so a 48h window
// would make "trending" nearly indistinguishable from "recent"; 30 days
// gives the age-decay term room to actually differentiate a newer,
// fast-accumulating item from an older, merely-popular one.
export const TRENDING_WINDOW_DAYS_NON_POST = 30;
