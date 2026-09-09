import type { NewsRegion, NewsTopic } from "@prisma/client";
// Type-only import: erased at build time, so the 39k-line translation
// table never ends up in the server bundle. Its only job is the
// `satisfies` check below, which fails the build if we ever try to make
// the news system speak a language the rest of ZRP cannot render.
import type { Language } from "@/lib/translations";
import { TRAVEL_LANGUAGES, type NewsLanguage } from "./types";

const _languagesAreSupportedByZrp = TRAVEL_LANGUAGES satisfies readonly Language[];
void _languagesAreSupportedByZrp;

export { TRAVEL_LANGUAGES };
export type { NewsLanguage };

export function isNewsLanguage(value: string): value is NewsLanguage {
  return (TRAVEL_LANGUAGES as readonly string[]).includes(value);
}

/**
 * Country catalogue. Adding a country is a one-line change here plus a
 * source or two - nothing else in the pipeline is country-specific.
 *
 * `timezone` is the representative IANA zone used for local-hour
 * scheduling ("don't push routine local news at 03:00 local").
 * `language` is the language stories from that country are summarised
 * into by default.
 */
export interface CountryEntry {
  code: string; // ISO-3166-1 alpha-2
  name: string;
  region: NewsRegion;
  timezone: string;
  language: string;
}

export const COUNTRIES: CountryEntry[] = [
  // ─── North America ───────────────────────────────────────────
  { code: "US", name: "United States", region: "NORTH_AMERICA", timezone: "America/New_York", language: "en" },
  { code: "CA", name: "Canada", region: "NORTH_AMERICA", timezone: "America/Toronto", language: "en" },
  { code: "MX", name: "Mexico", region: "NORTH_AMERICA", timezone: "America/Mexico_City", language: "es" },

  // ─── South America ───────────────────────────────────────────
  { code: "BR", name: "Brazil", region: "SOUTH_AMERICA", timezone: "America/Sao_Paulo", language: "en" },
  { code: "AR", name: "Argentina", region: "SOUTH_AMERICA", timezone: "America/Argentina/Buenos_Aires", language: "es" },
  { code: "CL", name: "Chile", region: "SOUTH_AMERICA", timezone: "America/Santiago", language: "es" },
  { code: "CO", name: "Colombia", region: "SOUTH_AMERICA", timezone: "America/Bogota", language: "es" },
  { code: "PE", name: "Peru", region: "SOUTH_AMERICA", timezone: "America/Lima", language: "es" },
  { code: "UY", name: "Uruguay", region: "SOUTH_AMERICA", timezone: "America/Montevideo", language: "es" },
  { code: "EC", name: "Ecuador", region: "SOUTH_AMERICA", timezone: "America/Guayaquil", language: "es" },

  // ─── Europe ──────────────────────────────────────────────────
  { code: "CH", name: "Switzerland", region: "EUROPE", timezone: "Europe/Zurich", language: "en" },
  { code: "FR", name: "France", region: "EUROPE", timezone: "Europe/Paris", language: "fr" },
  { code: "DE", name: "Germany", region: "EUROPE", timezone: "Europe/Berlin", language: "de" },
  { code: "IT", name: "Italy", region: "EUROPE", timezone: "Europe/Rome", language: "it" },
  { code: "GB", name: "United Kingdom", region: "EUROPE", timezone: "Europe/London", language: "en" },
  { code: "ES", name: "Spain", region: "EUROPE", timezone: "Europe/Madrid", language: "es" },
  { code: "PT", name: "Portugal", region: "EUROPE", timezone: "Europe/Lisbon", language: "en" },
  { code: "NL", name: "Netherlands", region: "EUROPE", timezone: "Europe/Amsterdam", language: "en" },
  { code: "BE", name: "Belgium", region: "EUROPE", timezone: "Europe/Brussels", language: "fr" },
  { code: "AT", name: "Austria", region: "EUROPE", timezone: "Europe/Vienna", language: "de" },
  { code: "SE", name: "Sweden", region: "EUROPE", timezone: "Europe/Stockholm", language: "en" },
  { code: "NO", name: "Norway", region: "EUROPE", timezone: "Europe/Oslo", language: "en" },
  { code: "DK", name: "Denmark", region: "EUROPE", timezone: "Europe/Copenhagen", language: "en" },
  { code: "FI", name: "Finland", region: "EUROPE", timezone: "Europe/Helsinki", language: "en" },
  { code: "PL", name: "Poland", region: "EUROPE", timezone: "Europe/Warsaw", language: "en" },
  { code: "GR", name: "Greece", region: "EUROPE", timezone: "Europe/Athens", language: "en" },
  { code: "IE", name: "Ireland", region: "EUROPE", timezone: "Europe/Dublin", language: "en" },
  { code: "CZ", name: "Czechia", region: "EUROPE", timezone: "Europe/Prague", language: "en" },
  { code: "RO", name: "Romania", region: "EUROPE", timezone: "Europe/Bucharest", language: "en" },
  { code: "HU", name: "Hungary", region: "EUROPE", timezone: "Europe/Budapest", language: "en" },
  { code: "AL", name: "Albania", region: "EUROPE", timezone: "Europe/Tirane", language: "sq" },
  { code: "UA", name: "Ukraine", region: "EUROPE", timezone: "Europe/Kyiv", language: "en" },

  // ─── Africa ──────────────────────────────────────────────────
  { code: "NG", name: "Nigeria", region: "AFRICA", timezone: "Africa/Lagos", language: "en" },
  { code: "ZA", name: "South Africa", region: "AFRICA", timezone: "Africa/Johannesburg", language: "en" },
  { code: "KE", name: "Kenya", region: "AFRICA", timezone: "Africa/Nairobi", language: "en" },
  { code: "GH", name: "Ghana", region: "AFRICA", timezone: "Africa/Accra", language: "en" },
  { code: "EG", name: "Egypt", region: "AFRICA", timezone: "Africa/Cairo", language: "ar" },
  { code: "MA", name: "Morocco", region: "AFRICA", timezone: "Africa/Casablanca", language: "fr" },
  { code: "DZ", name: "Algeria", region: "AFRICA", timezone: "Africa/Algiers", language: "fr" },
  { code: "TN", name: "Tunisia", region: "AFRICA", timezone: "Africa/Tunis", language: "fr" },
  { code: "TZ", name: "Tanzania", region: "AFRICA", timezone: "Africa/Dar_es_Salaam", language: "en" },
  { code: "ET", name: "Ethiopia", region: "AFRICA", timezone: "Africa/Addis_Ababa", language: "en" },
  { code: "SN", name: "Senegal", region: "AFRICA", timezone: "Africa/Dakar", language: "fr" },
  { code: "RW", name: "Rwanda", region: "AFRICA", timezone: "Africa/Kigali", language: "en" },

  // ─── Asia ────────────────────────────────────────────────────
  { code: "CN", name: "China", region: "ASIA", timezone: "Asia/Shanghai", language: "zh" },
  { code: "JP", name: "Japan", region: "ASIA", timezone: "Asia/Tokyo", language: "en" },
  { code: "KR", name: "South Korea", region: "ASIA", timezone: "Asia/Seoul", language: "en" },
  { code: "IN", name: "India", region: "ASIA", timezone: "Asia/Kolkata", language: "en" },
  { code: "ID", name: "Indonesia", region: "ASIA", timezone: "Asia/Jakarta", language: "id" },
  { code: "SG", name: "Singapore", region: "ASIA", timezone: "Asia/Singapore", language: "en" },
  { code: "TH", name: "Thailand", region: "ASIA", timezone: "Asia/Bangkok", language: "en" },
  { code: "PH", name: "Philippines", region: "ASIA", timezone: "Asia/Manila", language: "en" },
  { code: "VN", name: "Vietnam", region: "ASIA", timezone: "Asia/Ho_Chi_Minh", language: "en" },
  { code: "MY", name: "Malaysia", region: "ASIA", timezone: "Asia/Kuala_Lumpur", language: "en" },
  { code: "TW", name: "Taiwan", region: "ASIA", timezone: "Asia/Taipei", language: "zh" },
  { code: "PK", name: "Pakistan", region: "ASIA", timezone: "Asia/Karachi", language: "en" },
  { code: "BD", name: "Bangladesh", region: "ASIA", timezone: "Asia/Dhaka", language: "en" },

  // ─── Middle East ─────────────────────────────────────────────
  { code: "AE", name: "United Arab Emirates", region: "MIDDLE_EAST", timezone: "Asia/Dubai", language: "en" },
  { code: "SA", name: "Saudi Arabia", region: "MIDDLE_EAST", timezone: "Asia/Riyadh", language: "ar" },
  { code: "QA", name: "Qatar", region: "MIDDLE_EAST", timezone: "Asia/Qatar", language: "en" },
  { code: "IL", name: "Israel", region: "MIDDLE_EAST", timezone: "Asia/Jerusalem", language: "en" },
  { code: "JO", name: "Jordan", region: "MIDDLE_EAST", timezone: "Asia/Amman", language: "ar" },
  { code: "TR", name: "Turkey", region: "MIDDLE_EAST", timezone: "Europe/Istanbul", language: "tr" },
  { code: "KW", name: "Kuwait", region: "MIDDLE_EAST", timezone: "Asia/Kuwait", language: "ar" },
  { code: "OM", name: "Oman", region: "MIDDLE_EAST", timezone: "Asia/Muscat", language: "en" },
  { code: "BH", name: "Bahrain", region: "MIDDLE_EAST", timezone: "Asia/Bahrain", language: "en" },

  // ─── Oceania ─────────────────────────────────────────────────
  { code: "AU", name: "Australia", region: "OCEANIA", timezone: "Australia/Sydney", language: "en" },
  { code: "NZ", name: "New Zealand", region: "OCEANIA", timezone: "Pacific/Auckland", language: "en" },
  { code: "FJ", name: "Fiji", region: "OCEANIA", timezone: "Pacific/Fiji", language: "en" },
  { code: "PG", name: "Papua New Guinea", region: "OCEANIA", timezone: "Pacific/Port_Moresby", language: "en" },
];

const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export function getCountry(code: string | null | undefined): CountryEntry | null {
  if (!code) return null;
  return COUNTRY_BY_CODE.get(code.toUpperCase()) ?? null;
}

export function countriesInRegion(region: NewsRegion): CountryEntry[] {
  return COUNTRIES.filter((c) => c.region === region);
}

/** Topics that make a story part of the ZRP Travel News system. */
export const TRAVEL_TOPICS: NewsTopic[] = [
  "TRAVEL",
  "TOURISM",
  "TRANSPORTATION",
  "AVIATION",
];

export function isTravelTopic(topic: NewsTopic): boolean {
  return TRAVEL_TOPICS.includes(topic);
}

/**
 * Local hours during which routine (non-breaking) publication is
 * allowed for a feed. Breaking news and travel alerts bypass this - see
 * scheduler.ts.
 */
export const QUIET_HOURS_START = 23; // inclusive
export const QUIET_HOURS_END = 6; // exclusive

/**
 * Returns the local hour (0-23) in `timeZone` for a given instant,
 * using Intl rather than a timezone dependency. Falls back to UTC if
 * the runtime does not know the zone, so a typo'd zone degrades to
 * "publish on UTC hours" instead of throwing mid-cycle.
 */
export function localHourIn(timeZone: string, at: Date): number {
  try {
    const formatted = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hour12: false,
    }).format(at);
    const hour = Number(formatted);
    return Number.isFinite(hour) ? hour % 24 : at.getUTCHours();
  } catch {
    return at.getUTCHours();
  }
}

export function isQuietHour(timeZone: string, at: Date): boolean {
  const hour = localHourIn(timeZone, at);
  return hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END;
}
