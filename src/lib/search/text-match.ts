// ─── Deterministic, manipulation-resistant text-match scoring ────────
// Used as the PRIMARY key for "relevance" sort in every category. It is
// purely a function of the query string against the matched text -
// never engagement, recency, follower count, or anything an author or
// searcher could farm. Each category's own popularity counter only
// breaks ties among equally-good text matches (see ranking.ts) - a
// worse text match never outranks a better one just because it's more
// popular. This directly satisfies the "leonidas" -> exact username
// match, "#zrp" -> hashtag examples in the Advanced Search brief.

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Highest match tier across every candidate field, scored:
 * exact match (100) > starts-with (75) > whole-word match (50) >
 * plain substring (25) > no match (0).
 */
export function textMatchWeight(query: string, ...fields: (string | null | undefined)[]): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  let best = 0;
  const wordBoundary = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(q)}([^\\p{L}\\p{N}]|$)`, "iu");

  for (const raw of fields) {
    if (!raw) continue;
    const text = raw.toLowerCase();
    if (text === q) {
      return 100; // Can't be beaten by another field - short-circuit.
    }
    if (text.startsWith(q)) {
      best = Math.max(best, 75);
      continue;
    }
    if (wordBoundary.test(text)) {
      best = Math.max(best, 50);
      continue;
    }
    if (text.includes(q)) {
      best = Math.max(best, 25);
    }
  }
  return best;
}
