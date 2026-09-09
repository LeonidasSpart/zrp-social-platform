// Formats "who's typing" for a group thread, where - unlike 1:1, which
// only ever has one other person - any number of the other real members
// can be typing at once. Pure and framework-free on purpose: the actual
// English/translated copy lives in translations.ts under the
// "group.thread.typing*" keys, this only decides WHICH shape applies so
// it can be unit-tested without a LanguageContext.
export type TypingLabel =
  | { kind: "none" }
  | { kind: "one"; name: string }
  | { kind: "two"; name1: string; name2: string }
  | { kind: "many"; count: number };

/**
 * `names` should already be deduplicated, real display names (or
 * usernames as a fallback) for the OTHER members currently typing - the
 * current user's own typing state is never included by the caller.
 * Order is preserved for the "one"/"two" cases so the caller can pick a
 * stable pair rather than one that reshuffles on every re-render.
 */
export function describeGroupTyping(names: string[]): TypingLabel {
  const real = names.filter((n) => n && n.trim().length > 0);

  if (real.length === 0) return { kind: "none" };
  if (real.length === 1) return { kind: "one", name: real[0] };
  if (real.length === 2) return { kind: "two", name1: real[0], name2: real[1] };
  return { kind: "many", count: real.length };
}
