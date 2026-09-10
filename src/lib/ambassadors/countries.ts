import iso from "i18n-iso-countries";
import en from "i18n-iso-countries/langs/en.json";
import fr from "i18n-iso-countries/langs/fr.json";
import de from "i18n-iso-countries/langs/de.json";
import it from "i18n-iso-countries/langs/it.json";
import sq from "i18n-iso-countries/langs/sq.json";
import es from "i18n-iso-countries/langs/es.json";
import ru from "i18n-iso-countries/langs/ru.json";
import ar from "i18n-iso-countries/langs/ar.json";
import zh from "i18n-iso-countries/langs/zh.json";
import tr from "i18n-iso-countries/langs/tr.json";
import id from "i18n-iso-countries/langs/id.json";
import type { Language } from "@/lib/translations";

/*
 * The complete ZRP Global Ambassadors country dataset.
 *
 * Source of truth: the ISO 3166-1 alpha-2 standard, via the
 * i18n-iso-countries package (MIT licensed, actively maintained, used
 * by many production apps for exactly this). As of the installed
 * version this is 250 currently-assigned codes - every officially
 * recognized country, dependent territory and special administrative
 * region, including several that will always show zero ambassadors
 * (Antarctica, Bouvet Island, the British Indian Ocean Territory) and
 * one - "XK" / Kosovo - that the package carries as a widely-used
 * exceptional reservation even though it has no code formally
 * standardized by ISO itself.
 *
 * This list is deliberately NOT filtered, curated or hand-picked. The
 * previous, incomplete implementation this replaces hard-coded a
 * handful of "example" countries (Switzerland, France, Albania,
 * Germany, USA, ...) - that pattern is exactly what produced a map
 * that could never represent the whole world, and it must not come
 * back. Every consumer of this module (the world map, the country
 * explorer, search, and the stats API) iterates the SAME array
 * exported here, so there is exactly one place a country could ever
 * silently go missing, and
 * src/lib/ambassadors/__tests__/countries.test.ts asserts its size and
 * shape against this same package on every run.
 *
 * i18n-iso-countries natively ships localized official names for all
 * 11 ZRP languages (en/fr/de/it/sq/es/ru/ar/zh/tr/id) - registered
 * once, below, module-wide. getName() already returns the current ISO
 * short name (e.g. "Turkiye", not the older "Turkey") in every
 * language ZRP supports, including the "Etats-Unis d'Amerique" /
 * "Turquie" style local names the ambassador search is required to
 * understand - no ZRP-specific translation work was needed for this.
 */

let registered = false;
function ensureLocalesRegistered() {
  if (registered) return;
  iso.registerLocale(en);
  iso.registerLocale(fr);
  iso.registerLocale(de);
  iso.registerLocale(it);
  iso.registerLocale(sq);
  iso.registerLocale(es);
  iso.registerLocale(ru);
  iso.registerLocale(ar);
  iso.registerLocale(zh);
  iso.registerLocale(tr);
  iso.registerLocale(id);
  registered = true;
}
ensureLocalesRegistered();

export type ZrpRegion =
  | "AFRICA"
  | "ASIA"
  | "EUROPE"
  | "NORTH_AMERICA"
  | "SOUTH_AMERICA"
  | "OCEANIA"
  | "ANTARCTICA";

export const REGIONS: ZrpRegion[] = [
  "AFRICA",
  "ASIA",
  "EUROPE",
  "NORTH_AMERICA",
  "SOUTH_AMERICA",
  "OCEANIA",
  "ANTARCTICA",
];

/*
 * ISO 3166-1 has no continent field of its own, so this is the one
 * piece of geographic classification ZRP supplies itself - a
 * complete, apolitical UN-geoscheme-style continent assignment for
 * every one of the 250 codes above, used only for the Explorer's
 * region filter (never to remove a country from the dataset - see the
 * module comment above). Central America and the Caribbean are
 * grouped under NORTH_AMERICA, the standard convention; Antarctica and
 * its two uninhabited sub-antarctic territories (Bouvet Island, Heard
 * and McDonald Islands) get their own region rather than being folded
 * into a continent they don't belong to.
 *
 * Completeness (every canonical code assigned exactly once, no
 * omissions, no duplicates) is asserted by
 * src/lib/ambassadors/__tests__/countries.test.ts, not just by this
 * comment.
 */
export const REGION_BY_CODE: Record<string, ZrpRegion> = {
  AD: "EUROPE",
  AE: "ASIA",
  AF: "ASIA",
  AG: "NORTH_AMERICA",
  AI: "NORTH_AMERICA",
  AL: "EUROPE",
  AM: "ASIA",
  AO: "AFRICA",
  AQ: "ANTARCTICA",
  AR: "SOUTH_AMERICA",
  AS: "OCEANIA",
  AT: "EUROPE",
  AU: "OCEANIA",
  AW: "NORTH_AMERICA",
  AX: "EUROPE",
  AZ: "ASIA",
  BA: "EUROPE",
  BB: "NORTH_AMERICA",
  BD: "ASIA",
  BE: "EUROPE",
  BF: "AFRICA",
  BG: "EUROPE",
  BH: "ASIA",
  BI: "AFRICA",
  BJ: "AFRICA",
  BL: "NORTH_AMERICA",
  BM: "NORTH_AMERICA",
  BN: "ASIA",
  BO: "SOUTH_AMERICA",
  BQ: "NORTH_AMERICA",
  BR: "SOUTH_AMERICA",
  BS: "NORTH_AMERICA",
  BT: "ASIA",
  BV: "ANTARCTICA",
  BW: "AFRICA",
  BY: "EUROPE",
  BZ: "NORTH_AMERICA",
  CA: "NORTH_AMERICA",
  CC: "ASIA",
  CD: "AFRICA",
  CF: "AFRICA",
  CG: "AFRICA",
  CH: "EUROPE",
  CI: "AFRICA",
  CK: "OCEANIA",
  CL: "SOUTH_AMERICA",
  CM: "AFRICA",
  CN: "ASIA",
  CO: "SOUTH_AMERICA",
  CR: "NORTH_AMERICA",
  CU: "NORTH_AMERICA",
  CV: "AFRICA",
  CW: "NORTH_AMERICA",
  CX: "ASIA",
  CY: "ASIA",
  CZ: "EUROPE",
  DE: "EUROPE",
  DJ: "AFRICA",
  DK: "EUROPE",
  DM: "NORTH_AMERICA",
  DO: "NORTH_AMERICA",
  DZ: "AFRICA",
  EC: "SOUTH_AMERICA",
  EE: "EUROPE",
  EG: "AFRICA",
  EH: "AFRICA",
  ER: "AFRICA",
  ES: "EUROPE",
  ET: "AFRICA",
  FI: "EUROPE",
  FJ: "OCEANIA",
  FK: "SOUTH_AMERICA",
  FM: "OCEANIA",
  FO: "EUROPE",
  FR: "EUROPE",
  GA: "AFRICA",
  GB: "EUROPE",
  GD: "NORTH_AMERICA",
  GE: "ASIA",
  GF: "SOUTH_AMERICA",
  GG: "EUROPE",
  GH: "AFRICA",
  GI: "EUROPE",
  GL: "NORTH_AMERICA",
  GM: "AFRICA",
  GN: "AFRICA",
  GP: "NORTH_AMERICA",
  GQ: "AFRICA",
  GR: "EUROPE",
  GS: "SOUTH_AMERICA",
  GT: "NORTH_AMERICA",
  GU: "OCEANIA",
  GW: "AFRICA",
  GY: "SOUTH_AMERICA",
  HK: "ASIA",
  HM: "ANTARCTICA",
  HN: "NORTH_AMERICA",
  HR: "EUROPE",
  HT: "NORTH_AMERICA",
  HU: "EUROPE",
  ID: "ASIA",
  IE: "EUROPE",
  IL: "ASIA",
  IM: "EUROPE",
  IN: "ASIA",
  IO: "AFRICA",
  IQ: "ASIA",
  IR: "ASIA",
  IS: "EUROPE",
  IT: "EUROPE",
  JE: "EUROPE",
  JM: "NORTH_AMERICA",
  JO: "ASIA",
  JP: "ASIA",
  KE: "AFRICA",
  KG: "ASIA",
  KH: "ASIA",
  KI: "OCEANIA",
  KM: "AFRICA",
  KN: "NORTH_AMERICA",
  KP: "ASIA",
  KR: "ASIA",
  KW: "ASIA",
  KY: "NORTH_AMERICA",
  KZ: "ASIA",
  LA: "ASIA",
  LB: "ASIA",
  LC: "NORTH_AMERICA",
  LI: "EUROPE",
  LK: "ASIA",
  LR: "AFRICA",
  LS: "AFRICA",
  LT: "EUROPE",
  LU: "EUROPE",
  LV: "EUROPE",
  LY: "AFRICA",
  MA: "AFRICA",
  MC: "EUROPE",
  MD: "EUROPE",
  ME: "EUROPE",
  MF: "NORTH_AMERICA",
  MG: "AFRICA",
  MH: "OCEANIA",
  MK: "EUROPE",
  ML: "AFRICA",
  MM: "ASIA",
  MN: "ASIA",
  MO: "ASIA",
  MP: "OCEANIA",
  MQ: "NORTH_AMERICA",
  MR: "AFRICA",
  MS: "NORTH_AMERICA",
  MT: "EUROPE",
  MU: "AFRICA",
  MV: "ASIA",
  MW: "AFRICA",
  MX: "NORTH_AMERICA",
  MY: "ASIA",
  MZ: "AFRICA",
  NA: "AFRICA",
  NC: "OCEANIA",
  NE: "AFRICA",
  NF: "OCEANIA",
  NG: "AFRICA",
  NI: "NORTH_AMERICA",
  NL: "EUROPE",
  NO: "EUROPE",
  NP: "ASIA",
  NR: "OCEANIA",
  NU: "OCEANIA",
  NZ: "OCEANIA",
  OM: "ASIA",
  PA: "NORTH_AMERICA",
  PE: "SOUTH_AMERICA",
  PF: "OCEANIA",
  PG: "OCEANIA",
  PH: "ASIA",
  PK: "ASIA",
  PL: "EUROPE",
  PM: "NORTH_AMERICA",
  PN: "OCEANIA",
  PR: "NORTH_AMERICA",
  PS: "ASIA",
  PT: "EUROPE",
  PW: "OCEANIA",
  PY: "SOUTH_AMERICA",
  QA: "ASIA",
  RE: "AFRICA",
  RO: "EUROPE",
  RS: "EUROPE",
  RU: "EUROPE",
  RW: "AFRICA",
  SA: "ASIA",
  SB: "OCEANIA",
  SC: "AFRICA",
  SD: "AFRICA",
  SE: "EUROPE",
  SG: "ASIA",
  SH: "AFRICA",
  SI: "EUROPE",
  SJ: "EUROPE",
  SK: "EUROPE",
  SL: "AFRICA",
  SM: "EUROPE",
  SN: "AFRICA",
  SO: "AFRICA",
  SR: "SOUTH_AMERICA",
  SS: "AFRICA",
  ST: "AFRICA",
  SV: "NORTH_AMERICA",
  SX: "NORTH_AMERICA",
  SY: "ASIA",
  SZ: "AFRICA",
  TC: "NORTH_AMERICA",
  TD: "AFRICA",
  TF: "AFRICA",
  TG: "AFRICA",
  TH: "ASIA",
  TJ: "ASIA",
  TK: "OCEANIA",
  TL: "ASIA",
  TM: "ASIA",
  TN: "AFRICA",
  TO: "OCEANIA",
  TR: "ASIA",
  TT: "NORTH_AMERICA",
  TV: "OCEANIA",
  TW: "ASIA",
  TZ: "AFRICA",
  UA: "EUROPE",
  UG: "AFRICA",
  UM: "OCEANIA",
  US: "NORTH_AMERICA",
  UY: "SOUTH_AMERICA",
  UZ: "ASIA",
  VA: "EUROPE",
  VC: "NORTH_AMERICA",
  VE: "SOUTH_AMERICA",
  VG: "NORTH_AMERICA",
  VI: "NORTH_AMERICA",
  VN: "ASIA",
  VU: "OCEANIA",
  WF: "OCEANIA",
  WS: "OCEANIA",
  XK: "EUROPE",
  YE: "ASIA",
  YT: "AFRICA",
  ZA: "AFRICA",
  ZM: "AFRICA",
  ZW: "AFRICA",
};

export interface AmbassadorCountry {
  /** ISO 3166-1 alpha-2 code - the stable identifier used everywhere
   *  a country needs to be referenced (URLs, the database, the map). */
  code: string;
  /** Localized country name for the given language. */
  name: string;
  region: ZrpRegion;
}

const LOCALE_CODES: Language[] = ["en", "fr", "de", "it", "sq", "es", "ru", "ar", "zh", "tr", "id"];

/**
 * The full, unfiltered list of all 250 countries/territories, localized
 * to the given ZRP UI language and sorted by that language's collation
 * order. This is the single array every ambassador surface (map,
 * explorer, search, stats merge) is built from.
 */
export function getAllCountries(language: Language = "en"): AmbassadorCountry[] {
  const names = iso.getNames(language, { select: "official" });
  return Object.keys(names)
    .map((code) => ({
      code,
      name: names[code],
      region: REGION_BY_CODE[code],
    }))
    .sort((a, b) => a.name.localeCompare(b.name, language));
}

export function getCountryName(code: string, language: Language = "en"): string | undefined {
  return iso.getName(code.toUpperCase(), language, { select: "official" });
}

export function isValidCountryCode(code: string | null | undefined): code is string {
  if (!code) return false;
  return iso.isValid(code.toUpperCase());
}

export function toAlpha2(code: string): string | undefined {
  const upper = code.toUpperCase();
  if (iso.isValid(upper)) return upper;
  return undefined;
}

/**
 * Renders a flag emoji from an ISO alpha-2 code via Unicode Regional
 * Indicator Symbols - no image asset needed, and it inherits the
 * platform's own emoji font (same technique already used for the
 * single Swiss flag in the site footer).
 */
export function flagEmoji(code: string): string {
  const upper = code.toUpperCase();
  if (upper.length !== 2) return "\uD83C\uDFF3\uFE0F";
  const codePoints = upper.split("").map((c) => 0x1f1e6 - 65 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

/*
 * A small, curated set of well-known English search aliases for
 * countries whose common name shares no substring with any of their
 * 11 official localized names - e.g. searching "USA" or "Ivory Coast"
 * would otherwise fail to find "United States of America" /
 * "Cote d'Ivoire". This is deliberately short: most alternate names
 * ("Turkey" for Turkiye, "Russia" for "Russian Federation", "Vatican"
 * for "Holy See (Vatican City State)") already match as a plain
 * substring of an existing official name and need no entry here.
 * Nothing here takes a position on a contested name - these are
 * common-usage synonyms only, sourced from the country's own current
 * or previous official English short name.
 */
const SEARCH_ALIASES: Record<string, string[]> = {
  US: ["usa", "america", "united states"],
  GB: ["uk", "britain", "great britain"],
  CI: ["ivory coast"],
  MM: ["burma"],
  SZ: ["swaziland"],
  MK: ["macedonia"],
  CD: ["dr congo", "congo-kinshasa", "zaire", "congo kinshasa"],
  CG: ["congo-brazzaville", "congo brazzaville"],
  NL: ["holland"],
  TR: ["turkey"],
  KR: ["korea"],
  KP: ["korea"],
  LA: ["laos"],
  SY: ["syria"],
  IR: ["persia"],
  VN: ["viet nam"],
  TW: ["taiwan"],
  CZ: ["czechia"],
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

let searchIndexCache: Map<string, string[]> | null = null;

/**
 * One normalized string per {code, name-variant} pair, built once from
 * every one of the 11 localized official names plus SEARCH_ALIASES
 * above - so a search matches regardless of the viewer's current UI
 * language, accents, or which of a country's several common names
 * they typed (see the module doc: "Etats-Unis" / "USA" / "United
 * States" must all find the same country).
 */
function getSearchIndex(): Map<string, string[]> {
  if (searchIndexCache) return searchIndexCache;

  const index = new Map<string, string[]>();
  for (const code of Object.keys(REGION_BY_CODE)) {
    const variants = new Set<string>();
    for (const locale of LOCALE_CODES) {
      const name = iso.getName(code, locale, { select: "official" });
      if (name) variants.add(normalize(name));
    }
    for (const alias of SEARCH_ALIASES[code] || []) {
      variants.add(normalize(alias));
    }
    index.set(code, Array.from(variants));
  }
  searchIndexCache = index;
  return index;
}

/**
 * Searches the complete 250-country dataset by any of a country's
 * localized official names or known aliases, diacritic- and
 * case-insensitive, returned localized to `language` and sorted
 * alphabetically. An empty query returns the full list (still every
 * country - search narrows the view, it never replaces "no country
 * missing" with "no country findable").
 */
export function searchCountries(query: string, language: Language = "en"): AmbassadorCountry[] {
  const all = getAllCountries(language);
  const q = normalize(query);
  if (!q) return all;

  const index = getSearchIndex();
  return all.filter((country) => {
    const variants = index.get(country.code) || [];
    return variants.some((variant) => variant.includes(q));
  });
}

export function countriesInRegion(region: ZrpRegion, language: Language = "en"): AmbassadorCountry[] {
  return getAllCountries(language).filter((c) => c.region === region);
}
