import type { NewsRegion, NewsTopic } from "@prisma/client";

/*
 * ============================================================
 * Curated source registry (seed)
 * ============================================================
 *
 * The starting set of publicly available syndication feeds for the
 * pilot. Everything here is a feed a publisher operates specifically
 * for machine consumption, and every entry is polled through
 * ingest.ts, which obeys robots.txt, uses conditional GETs and backs
 * off on failure.
 *
 * ⚠️ These URLs have NOT been fetched from the build environment (its
 * network policy denies outbound access to publisher hosts), so they
 * are proposals, not verified endpoints. Before the pilot is enabled,
 * run the admin "verify" action on every source
 * (POST /api/admin/news-network/sources/[id]/verify): it performs one
 * live fetch and parse and reports what came back, without publishing
 * anything. Disable or correct whatever fails.
 *
 * A dead or moved feed is a safe failure: the source goes to
 * WARNING then FAILED with exponential backoff and shows up red on the
 * admin dashboard. It can never turn into fabricated content.
 *
 * `allowImages` is false everywhere by default. Turn it on per source
 * only once someone has actually read that publisher's terms and
 * confirmed preview images may be reused.
 *
 * `trustTier`: 1 = official authority (government, UN body, regulator,
 * airport, airline), 2 = established news organisation, 3 = other.
 */

export interface SeedSource {
  key: string;
  name: string;
  publisher: string;
  feedUrl: string;
  homepageUrl?: string;
  region: NewsRegion;
  country?: string;
  language: string;
  topics: NewsTopic[];
  trustTier: number;
  official?: boolean;
  fetchIntervalMinutes?: number;
  attribution?: string;
}

export const SEED_SOURCES: SeedSource[] = [
  // ─── Official / institutional (tier 1) ───────────────────────
  {
    key: "un-news-en",
    name: "UN News",
    publisher: "United Nations",
    feedUrl: "https://news.un.org/feed/subscribe/en/news/all/rss.xml",
    homepageUrl: "https://news.un.org/en/",
    region: "GLOBAL",
    language: "en",
    topics: ["WORLD", "POLITICS", "HEALTH", "ENVIRONMENT"],
    trustTier: 1,
    official: true,
  },
  {
    key: "who-news-en",
    name: "WHO News",
    publisher: "World Health Organization",
    feedUrl: "https://www.who.int/rss-feeds/news-english.xml",
    homepageUrl: "https://www.who.int/news",
    region: "GLOBAL",
    language: "en",
    topics: ["HEALTH", "SCIENCE"],
    trustTier: 1,
    official: true,
  },
  {
    key: "nasa-breaking",
    name: "NASA Breaking News",
    publisher: "NASA",
    feedUrl: "https://www.nasa.gov/rss/dyn/breaking_news.rss",
    homepageUrl: "https://www.nasa.gov/news/",
    region: "GLOBAL",
    language: "en",
    topics: ["SCIENCE"],
    trustTier: 1,
    official: true,
  },
  {
    key: "esa-space-news",
    name: "ESA Space News",
    publisher: "European Space Agency",
    feedUrl: "https://www.esa.int/rssfeed/Our_Activities/Space_News",
    homepageUrl: "https://www.esa.int/",
    region: "EUROPE",
    language: "en",
    topics: ["SCIENCE"],
    trustTier: 1,
    official: true,
  },

  // ─── Official travel / transport authorities (tier 1) ────────
  {
    key: "us-state-travel-advisories",
    name: "US Travel Advisories",
    publisher: "U.S. Department of State",
    feedUrl: "https://travel.state.gov/_res/rss/TAsTWs.xml",
    homepageUrl: "https://travel.state.gov/",
    region: "GLOBAL",
    language: "en",
    topics: ["TRAVEL", "SECURITY"],
    trustTier: 1,
    official: true,
    fetchIntervalMinutes: 120,
  },
  {
    key: "uk-fcdo-travel-advice",
    name: "UK Foreign Travel Advice",
    publisher: "UK Foreign, Commonwealth & Development Office",
    feedUrl: "https://www.gov.uk/foreign-travel-advice.atom",
    homepageUrl: "https://www.gov.uk/foreign-travel-advice",
    region: "GLOBAL",
    language: "en",
    topics: ["TRAVEL", "SECURITY"],
    trustTier: 1,
    official: true,
    attribution: "Contains public sector information licensed under the Open Government Licence v3.0.",
    fetchIntervalMinutes: 120,
  },

  // ─── Established news organisations (tier 2) ─────────────────
  {
    key: "bbc-world",
    name: "BBC News — World",
    publisher: "BBC News",
    feedUrl: "https://feeds.bbci.co.uk/news/world/rss.xml",
    homepageUrl: "https://www.bbc.com/news/world",
    region: "GLOBAL",
    language: "en",
    topics: ["WORLD", "POLITICS"],
    trustTier: 2,
  },
  {
    key: "bbc-business",
    name: "BBC News — Business",
    publisher: "BBC News",
    feedUrl: "https://feeds.bbci.co.uk/news/business/rss.xml",
    homepageUrl: "https://www.bbc.com/news/business",
    region: "GLOBAL",
    language: "en",
    topics: ["BUSINESS", "ECONOMY"],
    trustTier: 2,
  },
  {
    key: "bbc-technology",
    name: "BBC News — Technology",
    publisher: "BBC News",
    feedUrl: "https://feeds.bbci.co.uk/news/technology/rss.xml",
    homepageUrl: "https://www.bbc.com/news/technology",
    region: "GLOBAL",
    language: "en",
    topics: ["TECHNOLOGY", "AI"],
    trustTier: 2,
  },
  {
    key: "guardian-world",
    name: "The Guardian — World",
    publisher: "The Guardian",
    feedUrl: "https://www.theguardian.com/world/rss",
    homepageUrl: "https://www.theguardian.com/world",
    region: "GLOBAL",
    language: "en",
    topics: ["WORLD", "POLITICS"],
    trustTier: 2,
  },
  {
    key: "aljazeera-all",
    name: "Al Jazeera English",
    publisher: "Al Jazeera",
    feedUrl: "https://www.aljazeera.com/xml/rss/all.xml",
    homepageUrl: "https://www.aljazeera.com/",
    region: "MIDDLE_EAST",
    language: "en",
    topics: ["WORLD", "POLITICS"],
    trustTier: 2,
  },
  {
    key: "npr-news",
    name: "NPR News",
    publisher: "NPR",
    feedUrl: "https://feeds.npr.org/1001/rss.xml",
    homepageUrl: "https://www.npr.org/",
    region: "NORTH_AMERICA",
    country: "US",
    language: "en",
    topics: ["WORLD", "POLITICS"],
    trustTier: 2,
  },
  {
    key: "cbc-top-stories",
    name: "CBC News — Top Stories",
    publisher: "CBC News",
    feedUrl: "https://www.cbc.ca/webfeed/rss/rss-topstories",
    homepageUrl: "https://www.cbc.ca/news",
    region: "NORTH_AMERICA",
    country: "CA",
    language: "en",
    topics: ["WORLD", "POLITICS"],
    trustTier: 2,
  },

  // ─── Pilot market sources: CH / FR / DE / IT ─────────────────
  {
    key: "swissinfo-eng",
    name: "SWI swissinfo.ch",
    publisher: "SWI swissinfo.ch",
    feedUrl: "https://www.swissinfo.ch/service/rss/latest/rss.xml",
    homepageUrl: "https://www.swissinfo.ch/eng/",
    region: "EUROPE",
    country: "CH",
    language: "en",
    topics: ["WORLD", "POLITICS", "BUSINESS"],
    trustTier: 2,
  },
  {
    key: "france24-en",
    name: "FRANCE 24 — English",
    publisher: "FRANCE 24",
    feedUrl: "https://www.france24.com/en/rss",
    homepageUrl: "https://www.france24.com/en/",
    region: "EUROPE",
    country: "FR",
    language: "en",
    topics: ["WORLD", "POLITICS"],
    trustTier: 2,
  },
  {
    key: "lemonde-une",
    name: "Le Monde — À la une",
    publisher: "Le Monde",
    feedUrl: "https://www.lemonde.fr/rss/une.xml",
    homepageUrl: "https://www.lemonde.fr/",
    region: "EUROPE",
    country: "FR",
    language: "fr",
    topics: ["WORLD", "POLITICS"],
    trustTier: 2,
  },
  {
    key: "dw-en-all",
    name: "Deutsche Welle — English",
    publisher: "Deutsche Welle",
    feedUrl: "https://rss.dw.com/rdf/rss-en-all",
    homepageUrl: "https://www.dw.com/en/",
    region: "EUROPE",
    country: "DE",
    language: "en",
    topics: ["WORLD", "POLITICS"],
    trustTier: 2,
  },
  {
    key: "tagesschau-de",
    name: "tagesschau",
    publisher: "tagesschau (ARD)",
    feedUrl: "https://www.tagesschau.de/index~rss2.xml",
    homepageUrl: "https://www.tagesschau.de/",
    region: "EUROPE",
    country: "DE",
    language: "de",
    topics: ["WORLD", "POLITICS"],
    trustTier: 2,
  },
  {
    key: "ansa-it",
    name: "ANSA",
    publisher: "ANSA",
    feedUrl: "https://www.ansa.it/sito/ansait_rss.xml",
    homepageUrl: "https://www.ansa.it/",
    region: "EUROPE",
    country: "IT",
    language: "it",
    topics: ["WORLD", "POLITICS"],
    trustTier: 2,
  },
];

export function seedSourceKeys(): string[] {
  return SEED_SOURCES.map((source) => source.key);
}
