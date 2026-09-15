/**
 * Creator diversity pass
 * ============================================================
 *
 * Runs after DiscoverRankingService has scored and sorted a page's
 * candidates. Simple and deterministic, as the directive for this
 * feature explicitly asks for ("the exact diversity strategy should be
 * simple and deterministic for V1"):
 *
 * Walk the ranked list left to right. Whenever the next item would
 * repeat the immediately preceding item's author, look ahead a bounded
 * window (LOOKAHEAD_WINDOW items) for the nearest later item by a
 * DIFFERENT author and pull it forward in front of the repeat. If no
 * such item exists within the window, the repeat is left in place -
 * "avoid destroying relevance simply to force diversity" (directive) -
 * rather than silently dropping content or degrading pagination to
 * force strict alternation when there genuinely isn't enough distinct
 * content available yet.
 *
 * This never drops or duplicates an item - it is a pure reordering of
 * the same array - so it cannot introduce the pagination bugs (skipped/
 * duplicated items) a less careful diversity pass could.
 */

import type { ScoredDiscoverPost } from "./types";

const LOOKAHEAD_WINDOW = 10;

export function diversifyByCreator(ranked: ScoredDiscoverPost[]): ScoredDiscoverPost[] {
  if (ranked.length <= 1) return ranked;

  // Work against a shallow-copy queue so the caller's array (and its
  // relative order for ties/analysis elsewhere) is never mutated.
  const pool = [...ranked];
  const result: ScoredDiscoverPost[] = [];

  while (pool.length > 0) {
    const lastAuthorId = result.length > 0 ? result[result.length - 1].authorId : null;

    if (pool[0].authorId !== lastAuthorId) {
      result.push(pool.shift() as ScoredDiscoverPost);
      continue;
    }

    const windowEnd = Math.min(pool.length, LOOKAHEAD_WINDOW);
    let swapIndex = -1;
    for (let i = 1; i < windowEnd; i++) {
      if (pool[i].authorId !== lastAuthorId) {
        swapIndex = i;
        break;
      }
    }

    if (swapIndex === -1) {
      // No alternative creator within the lookahead window - allow the
      // repeat rather than starving the feed or destroying relevance.
      result.push(pool.shift() as ScoredDiscoverPost);
    } else {
      const [item] = pool.splice(swapIndex, 1);
      result.push(item);
    }
  }

  return result;
}
