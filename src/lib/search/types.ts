/**
 * Shared types for Advanced Search (src/lib/search/, GET /api/search).
 * See docs/advanced-search-architecture.md for the full contract this
 * supports: categories, filters, sort modes, and the two pagination
 * strategies (true DB keyset for "recent"; cached-ranked-list +
 * numeric-offset cursor for score-based sorts, the same convention
 * already established by GET /api/posts/explore and GET
 * /api/hashtags/search).
 */

export type SearchCategory =
  | "users"
  | "posts"
  | "hashtags"
  | "communities"
  | "news"
  | "music"
  | "opportunities"
  | "marketplace";

export const SEARCH_CATEGORIES: SearchCategory[] = [
  "users",
  "posts",
  "hashtags",
  "communities",
  "news",
  "music",
  "opportunities",
  "marketplace",
];

/**
 * relevance: text-match quality (see text-match.ts) as the primary key,
 *   each category's own popularity counter as a tiebreak. Never
 *   engagement-only - a query match always outranks a popular
 *   non-match.
 * recent: createdAt/publishedAt desc, true DB keyset pagination.
 * engagement: each category's own popularity counter (see
 *   docs/advanced-search-architecture.md's per-category table), no
 *   time decay - an all-time leaderboard.
 * trending: the same counter, decayed by age - a newer item
 *   accumulating attention fast can outrank an older, more-viewed one.
 *   Posts reuse the exact GET /api/posts/explore "Trending"/"For You"
 *   formulas (src/lib/feed/scoring.ts) for consistency with the
 *   existing feed; other categories use an analogous counter/age
 *   formula with a longer (30-day) window, since non-post content
 *   doesn't churn hourly. All four sorts are pure functions of stored,
 *   server-computed fields - never a client-supplied score.
 */
export type SearchSort = "relevance" | "recent" | "engagement" | "trending";

export type DateRangeOption = "any" | "24h" | "7d" | "30d" | "custom";

export type MediaFilter = "image" | "video" | "gif" | "poll" | "none";

export interface SearchFilters {
  dateRange: DateRangeOption;
  dateFrom: Date | null;
  dateTo: Date | null;
  /**
   * Matched against the *author's* languageCode for People/Posts (Post
   * itself has no language column - see the module doc on
   * src/lib/search/categories/posts.ts for why). Not applicable to the
   * other categories.
   */
  language: string | null;
  /** ISO 3166-1 alpha-2, matched against the normalized countryCode column. */
  country: string | null;
  media: MediaFilter | null;
  /** People: badgeType is set. Posts: author's badgeType is set. */
  verified: boolean;
  /** People only: headline/company/position set. */
  professional: boolean;
  /** People only: has a CreatorProfile. Posts: author has one. */
  creator: boolean;
  /** Community slug - scopes Posts/Hashtags to that community's hashtag. */
  community: string | null;
}

export interface SearchPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface SearchQueryParams {
  query: string;
  sort: SearchSort;
  filters: SearchFilters;
  viewerId: string | null;
  excludedAuthorIds: string[];
  cursor: string | null;
  limit: number;
}
