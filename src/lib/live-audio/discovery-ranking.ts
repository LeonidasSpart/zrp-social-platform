/**
 * Shared discovery ranking for Live Audio AND Live Video's "browse live
 * rooms now" feed - reused by both room-service.ts files rather than
 * duplicated, same cross-import pattern Live Video already uses for
 * livekit.ts/permissions.ts.
 *
 * Score blends a log-dampened viewer count (so a 10,000-viewer room
 * doesn't permanently bury every other room - log2(10001) ~= 13.3 vs.
 * log2(11) ~= 3.5, a meaningful but not crushing gap) with a freshness
 * bonus that decays over the first hour, so a smaller, newer room still
 * surfaces instead of a handful of long-running giants dominating the
 * feed forever. Deliberately NOT pure recency either (the naive
 * `orderBy: startedAt desc` this replaces): a brand-new room with zero
 * viewers still ranks below one with real engagement.
 */
export function computeLiveRoomScore(params: { viewerCount: number; startedAt: Date | null }): number {
  const { viewerCount, startedAt } = params;
  const viewerScore = Math.log2(Math.max(viewerCount, 0) + 1) * 10;
  const ageMinutes = startedAt ? Math.max(0, (Date.now() - startedAt.getTime()) / 60_000) : 0;
  const freshnessBonus = Math.max(0, 30 - ageMinutes / 2);
  return viewerScore + freshnessBonus;
}

/**
 * Sorts a candidate pool by score and returns one page plus an opaque
 * offset-encoded cursor. Ranking a dynamic, realtime score can't use a
 * stable row-id cursor the way plain recency pagination does (a room's
 * rank can move between requests as viewer counts change) - this is
 * the same standard tradeoff any "trending now" feed makes, not unique
 * to this one. `cursor` here is whatever the previous page's
 * `nextCursor` was - callers never need to know it encodes an offset.
 */
export function rankAndPaginate<T extends { viewerCount: number; startedAt: Date | null }>(
  candidates: T[],
  cursor: string | null | undefined,
  limit: number
): { page: T[]; nextCursor: string | null } {
  const offset = cursor ? Math.max(0, parseInt(cursor, 10) || 0) : 0;
  const sorted = [...candidates].sort((a, b) => computeLiveRoomScore(b) - computeLiveRoomScore(a));
  const page = sorted.slice(offset, offset + limit);
  const nextCursor = offset + limit < sorted.length ? String(offset + limit) : null;
  return { page, nextCursor };
}
