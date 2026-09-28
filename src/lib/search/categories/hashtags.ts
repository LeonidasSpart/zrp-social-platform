import { getAllHashtagCounts, getRecentHashtagCounts, HashtagCount } from "@/lib/hashtags/counts";
import { textMatchWeight } from "../text-match";
import { relevanceScore } from "../ranking";
import { paginateRanked, parseOffsetCursor } from "../paginate";
import { RANKED_CACHE_TTL_SECONDS, TRENDING_WINDOW_DAYS_NON_POST } from "../constants";
import type { SearchPage, SearchQueryParams } from "../types";

// ─── Hashtags: exact/partial + trending ───────────────────────────────
// No dedicated Hashtag table (String[] on Post) and no per-hashtag
// timestamp to keyset-paginate "recent" by, so `sort=recent` falls back
// to `relevance` here (documented in docs/advanced-search-architecture.md)
// rather than returning an arbitrary or unstable order. Not scoped by
// viewer (the underlying tally already excludes banned-author/
// unpublished/scheduled content at the source - see
// src/lib/hashtags/counts.ts), so unlike every other category this
// cache key carries no viewerId.

export type HashtagSearchResult = HashtagCount;

export async function searchHashtags(params: SearchQueryParams): Promise<SearchPage<HashtagSearchResult>> {
  const raw = params.query.trim().toLowerCase().replace(/^#/, "");
  if (!raw) return { items: [], nextCursor: null };

  const effectiveSort = params.sort === "recent" ? "relevance" : params.sort;
  const offset = parseOffsetCursor(params.cursor);
  const cacheKey = `search:hashtags:v1:${effectiveSort}:${raw}`;

  return paginateRanked<HashtagSearchResult>(cacheKey, RANKED_CACHE_TTL_SECONDS, offset, params.limit, async () => {
    const all =
      effectiveSort === "trending"
        ? await getRecentHashtagCounts(TRENDING_WINDOW_DAYS_NON_POST)
        : await getAllHashtagCounts();

    const matches = all.filter((h) => h.tag.startsWith(raw));

    if (effectiveSort === "engagement" || effectiveSort === "trending") {
      return matches; // already count-desc (+ alpha tiebreak) from the tally itself.
    }

    // relevance: an exact tag match ranks above a longer prefix match; count breaks ties.
    return matches
      .map((h) => ({ h, score: relevanceScore(textMatchWeight(raw, h.tag), h.count) }))
      .sort((a, b) => b.score - a.score)
      .map((r) => r.h);
  });
}
