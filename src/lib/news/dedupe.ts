import crypto from "crypto";

/*
 * ============================================================
 * Duplicate story detection
 * ============================================================
 *
 * The single most important guard in this system. Fifteen outlets
 * reporting one airport closure must become one ZRP post with fifteen
 * attributions, never fifteen posts.
 *
 * Two layers:
 *
 *  1. `fingerprint()` - an exact key over the significant words of a
 *     headline, order-independent. Stored under a UNIQUE constraint, so
 *     even two concurrent pipeline runs cannot both create the story.
 *  2. `similarity()` - fuzzy matching for the far commoner case where
 *     outlets word the same event differently. Compared against recent
 *     stories only.
 *
 * If either layer errors, the caller treats the candidate as a
 * duplicate and drops it (see ingest.ts): failing safe here means
 * publishing less, and failing open means flooding the platform.
 */

// Stopwords across the languages the pipeline ingests. Removing them is
// what lets "Storm closes Geneva airport" and "Geneva airport closed
// after storm" resolve to the same token set.
const STOPWORDS = new Set([
  // English
  "a", "an", "the", "and", "or", "but", "of", "in", "on", "at", "to", "for", "from",
  "by", "with", "as", "is", "are", "was", "were", "be", "been", "will", "would",
  "has", "have", "had", "it", "its", "that", "this", "these", "those", "after",
  "before", "over", "under", "into", "amid", "says", "say", "said", "new", "up", "down",
  // French
  "le", "la", "les", "un", "une", "des", "du", "de", "et", "ou", "dans", "sur",
  "pour", "par", "avec", "au", "aux", "est", "sont", "que", "qui", "ce", "cette",
  "apres", "plus", "se", "sa", "son", "ses",
  // German
  "der", "die", "das", "den", "dem", "ein", "eine", "einer", "und", "oder", "im",
  "in", "auf", "fuer", "von", "mit", "ist", "sind", "wird", "werden", "nach", "bei",
  "zu", "zum", "zur", "sich", "wegen",
  // Italian
  "il", "lo", "gli", "un", "uno", "una", "dei", "delle", "della", "del", "e", "o",
  "in", "su", "per", "con", "al", "alla", "ai", "che", "chi", "questo", "dopo",
  "sono", "non",
  // Spanish
  "el", "los", "las", "una", "unos", "unas", "y", "o", "en", "sobre", "para",
  "por", "con", "es", "son", "que", "este", "esta", "tras",
]);

/** Lowercases, strips accents, drops punctuation and collapses spaces. */
export function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Strips punctuation rather than "keep only letters/digits": the
    // \p{L} form needs the /u flag, which this project's ES5 target
    // rejects, and an ASCII-only [^\w\s] would delete every Chinese,
    // Arabic and Cyrillic headline down to nothing.
    .replace(/[!-\/:-@\[-`{-~\u00a1-\u00bf\u2010-\u205e\u3001-\u303f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Significant, deduplicated tokens of a headline, in sorted order. */
export function significantTokens(title: string): string[] {
  const tokens = normalizeText(title)
    .split(" ")
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));

  return Array.from(new Set(tokens)).sort();
}

export function normalizeTitle(title: string): string {
  return significantTokens(title).join(" ");
}

/**
 * Order-independent exact key for a headline. Uses the eight
 * alphabetically-first significant tokens, so two outlets running the
 * same words in a different order collide.
 *
 * It is an *exact* key and nothing more: a publisher appending its own
 * name ("... - Example Wire") adds tokens and therefore produces a
 * different fingerprint. That case is caught by the fuzzy layer below,
 * which is why there are two layers - see the tests in
 * __tests__/dedupe.test.ts.
 */
export function fingerprint(title: string): string {
  const tokens = significantTokens(title).slice(0, 8);
  const basis = tokens.length > 0 ? tokens.join(" ") : normalizeText(title);
  return crypto.createHash("sha256").update(basis).digest("hex").slice(0, 40);
}

/** Jaccard similarity over significant tokens: 0 (unrelated) to 1. */
export function tokenSimilarity(a: string, b: string): number {
  const setA = new Set(significantTokens(a));
  const setB = new Set(significantTokens(b));
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  setA.forEach((token) => {
    if (setB.has(token)) intersection += 1;
  });

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Containment: how much of the shorter headline is present in the
 * longer one. Jaccard alone under-scores "Geneva airport closed" versus
 * "Geneva airport closed after overnight storm disrupts flights", which
 * are plainly the same event.
 */
export function containmentSimilarity(a: string, b: string): number {
  const setA = new Set(significantTokens(a));
  const setB = new Set(significantTokens(b));
  if (setA.size === 0 || setB.size === 0) return 0;

  const [small, large] = setA.size <= setB.size ? [setA, setB] : [setB, setA];

  let shared = 0;
  small.forEach((token) => {
    if (large.has(token)) shared += 1;
  });

  return shared / small.size;
}

export function similarity(a: string, b: string): number {
  return Math.max(tokenSimilarity(a, b), containmentSimilarity(a, b) * 0.95);
}

// Above this, two headlines are the same event. Tuned to be
// conservative in the direction that costs us a post rather than one
// that spams the feed.
export const DUPLICATE_THRESHOLD = 0.6;

export interface DedupeCandidate {
  id: string;
  title: string;
}

/**
 * Returns the existing story a new headline duplicates, or null.
 * `existing` should already be limited to a recent window - two
 * unrelated events months apart can legitimately share a headline
 * ("Storm closes Geneva airport" happens more than once).
 */
export function findDuplicate<T extends DedupeCandidate>(
  title: string,
  existing: T[],
  threshold = DUPLICATE_THRESHOLD
): { match: T; score: number } | null {
  let best: { match: T; score: number } | null = null;

  for (const candidate of existing) {
    const score = similarity(title, candidate.title);
    if (score >= threshold && (!best || score > best.score)) {
      best = { match: candidate, score };
    }
  }

  return best;
}
