import iso from "i18n-iso-countries";
import { SEARCH_ALIASES } from "@/lib/ambassadors/countries";

// ─── Country normalization ──────────────────────────────────────────
//
// The free-text `User.country`/`User.location` fields let someone type
// "Switzerland", "Suisse", "Schweiz" or "CH" and mean exactly the same
// country - but a raw string comparison treats those as four different
// values. This module derives the single canonical ISO 3166-1 alpha-2
// code (`User.countryCode`) those variants all resolve to, reusing the
// same i18n-iso-countries dataset and locale registrations the ZRP
// Global Ambassadors feature already established as ZRP's one source of
// truth for country data (src/lib/ambassadors/countries.ts) - this
// module doesn't register its own copy of the locales or maintain a
// second alias list.
//
// Never guesses: an input that doesn't exactly match a known code, an
// official name in one of ZRP's 11 registered languages, or a listed
// alias returns null rather than a best-effort partial match. A wrong
// normalization (e.g. matching "Guinea" to the wrong one of four
// "Guinea"-named countries) would silently corrupt analytics, ad
// targeting and feed ranking - returning null and leaving the country
// unclassified is always safer than a confident wrong answer.
import "@/lib/ambassadors/countries"; // ensures locales are registered before use

const DIACRITIC_MARK_RANGE = String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f);
const DIACRITIC_MARK_PATTERN = new RegExp("[" + DIACRITIC_MARK_RANGE + "]", "g");

function normalize(value: string): string {
  return value.normalize("NFD").replace(DIACRITIC_MARK_PATTERN, "").toLowerCase().trim();
}

const REGISTERED_LOCALES = ["en", "fr", "de", "it", "sq", "es", "ru", "ar", "zh", "tr", "id", "no", "sr", "bs", "mk"] as const;

// One normalized-name -> code lookup built once from every name variant
// (official AND common short form - `select: "all"`) in all 11
// registered languages plus SEARCH_ALIASES, keyed by the same case/
// diacritic-insensitive `normalize()` used above - so "Turkiye" (no
// diacritic) and "Türkiye" (the official ISO short name) resolve to the
// same code, the same way "Switzerland"/"Suisse"/"Schweiz" do.
//
// `select: "all"` matters, not just "official": for a country whose
// official long name differs from its common short name (e.g. North
// Macedonia's official name is "The Republic of North Macedonia"), a
// user who typed the short, everyday name would otherwise never match
// anything and be left unresolved despite typing a real, unambiguous
// country name - `select: "all"` returns both forms per country
// (verified: always an array, one entry per known name variant),
// closing that gap without weakening the "exact match only" guarantee
// below. i18n-iso-countries' own getAlpha2Code() only does an exact
// literal match against the input's own casing/diacritics, which misses
// the diacritic-insensitive case, so this module still builds its own
// normalized index rather than relying on it directly.
let nameLookupCache: Map<string, string> | null = null;

function getNameLookup(): Map<string, string> {
  if (nameLookupCache) return nameLookupCache;

  // Build key -> set of candidate codes first, rather than a straight
  // key -> code map: `select: "all"` widens the name pool enough that a
  // handful of bare short names are genuinely ambiguous across two real
  // countries (e.g. "Congo" alone is used for both CG and CD; "Shën
  // Martin" in Albanian names both MF and SX). A plain Map.set() would
  // silently let whichever locale is processed last win - exactly the
  // "confident wrong answer" this module exists to avoid. Any name that
  // resolves to more than one distinct code is dropped from the index
  // entirely below, left for the caller to see as unresolved rather than
  // guessed.
  const candidates = new Map<string, Set<string>>();
  const addCandidate = (name: string, code: string) => {
    const key = normalize(name);
    if (!candidates.has(key)) candidates.set(key, new Set());
    candidates.get(key)!.add(code);
  };

  for (const locale of REGISTERED_LOCALES) {
    const names = iso.getNames(locale, { select: "all" });
    for (const [code, variants] of Object.entries(names)) {
      for (const name of variants) addCandidate(name, code);
    }
  }
  for (const [code, aliases] of Object.entries(SEARCH_ALIASES)) {
    for (const alias of aliases) addCandidate(alias, code);
  }

  const map = new Map<string, string>();
  candidates.forEach((codes, key) => {
    if (codes.size === 1) map.set(key, codes.values().next().value as string);
  });
  nameLookupCache = map;
  return map;
}

/**
 * Normalizes any free-text country input (a raw ISO code, an official
 * name in any of ZRP's 11 languages, or a known common alias like
 * "USA"/"UK") to its canonical ISO 3166-1 alpha-2 code, or null when it
 * cannot be resolved with confidence. Case- and diacritic-insensitive;
 * always an exact match against a known name/alias, never a partial or
 * fuzzy one.
 */
export function normalizeCountryInput(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 1. Already a valid ISO alpha-2 or alpha-3 code.
  if (iso.isValid(trimmed)) {
    return iso.toAlpha2(trimmed)?.toUpperCase() ?? null;
  }

  // 2. An exact official name (any registered language) or known alias.
  return getNameLookup().get(normalize(trimmed)) ?? null;
}
