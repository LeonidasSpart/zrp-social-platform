import { getCached, setCached } from "@/lib/redis";

/**
 * True DB-keyset pagination: given a batch fetched with `take: limit +
 * 1` (the standard overfetch-by-one trick) in a stable order, splits it
 * into the page to return plus the next cursor - or null once there's
 * nothing left. No duplicates or gaps across pages regardless of
 * concurrent writes, unlike an offset-based scheme. Generalizes
 * src/lib/pagination.ts's own buildPage (same contract) for the search
 * result item shapes here.
 */
export function buildKeysetPage<T extends { id: string }>(
  rows: T[],
  limit: number
): { items: T[]; nextCursor: string | null } {
  if (rows.length > limit) {
    const page = rows.slice(0, limit);
    return { items: page, nextCursor: page[page.length - 1].id };
  }
  return { items: rows, nextCursor: null };
}

export function parseOffsetCursor(cursor: string | null): number {
  const n = cursor ? parseInt(cursor, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Cached-ranked-list + numeric-offset-cursor pagination, for score-based
 * sorts (relevance/engagement/trending) where ranking isn't a DB keyset
 * walk - the same convention GET /api/posts/explore and GET
 * /api/hashtags/search already established. `computeRanked` runs only
 * on a cache miss and must return every candidate already in final
 * sorted order; the full ranked list is cached under `cacheKey` for
 * `ttlSeconds`, and pages are numeric-offset slices of it, so a client
 * paging 1->2->3 within the cache window sees no dupes/gaps. Depth is
 * bounded by however many candidates `computeRanked` fetched - the same
 * accepted, documented tradeoff explore/hashtags already ship with,
 * not a new limitation Advanced Search introduces.
 */
export async function paginateRanked<T>(
  cacheKey: string,
  ttlSeconds: number,
  offset: number,
  limit: number,
  computeRanked: () => Promise<T[]>
): Promise<{ items: T[]; nextCursor: string | null }> {
  let ranked = await getCached<T[]>(cacheKey);
  if (!ranked) {
    ranked = await computeRanked();
    await setCached(cacheKey, ranked, ttlSeconds);
  }
  const items = ranked.slice(offset, offset + limit);
  const nextCursor = offset + limit < ranked.length ? String(offset + limit) : null;
  return { items, nextCursor };
}
