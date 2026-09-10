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

  // ─── Regional coverage (tier 2) ──────────────────────────────
  // BBC's own per-region World Service feeds, on the same
  // feeds.bbci.co.uk host already fetching cleanly for bbc-world /
  // bbc-business / bbc-technology above - added specifically to give
  // Africa, Asia, Latin America and North America their own real
  // region tag (see ingest.ts: a story's region/country comes
  // directly from whichever source it was fetched from, not from
  // analysing the article text), rather than everything defaulting to
  // GLOBAL/WORLD. No source claiming to be Russia-specific is added
  // here: the only widely-syndicated Russia-focused outlets are
  // state-run and not independently verifiable as neutral, and no
  // genuinely independent Russia-specific RSS feed was confirmed
  // reachable to add responsibly instead of guessing one.
  {
    key: "bbc-africa",
    name: "BBC News — Africa",
    publisher: "BBC News",
    feedUrl: "https://feeds.bbci.co.uk/news/world/africa/rss.xml",
    homepageUrl: "https://www.bbc.com/news/world/africa",
    region: "AFRICA",
    language: "en",
    topics: ["WORLD", "POLITICS"],
    trustTier: 2,
  },
  {
    key: "bbc-asia",
    name: "BBC News — Asia",
    publisher: "BBC News",
    feedUrl: "https://feeds.bbci.co.uk/news/world/asia/rss.xml",
    homepageUrl: "https://www.bbc.com/news/world/asia",
    region: "ASIA",
    language: "en",
    topics: ["WORLD", "POLITICS"],
    trustTier: 2,
  },
  {
    key: "bbc-latin-america",
    name: "BBC News — Latin America",
    publisher: "BBC News",
    feedUrl: "https://feeds.bbci.co.uk/news/world/latin_america/rss.xml",
    homepageUrl: "https://www.bbc.com/news/world/latin_america",
    region: "SOUTH_AMERICA",
    language: "en",
    topics: ["WORLD", "POLITICS"],
    trustTier: 2,
  },
  {
    key: "bbc-us-canada",
    name: "BBC News — US & Canada",
    publisher: "BBC News",
    feedUrl: "https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml",
    homepageUrl: "https://www.bbc.com/news/world/us_and_canada",
    region: "NORTH_AMERICA",
    language: "en",
    topics: ["WORLD", "POLITICS"],
    trustTier: 2,
  },

  // ─── Category coverage (tier 2) ───────────────────────────────
  // Every category ZRP News displays needs a source that actually
  // produces stories the classifier will put there. Sports had no
  // source at all, and Culture, Science and Health were relying on
  // whatever a general world/business desk happened to mention. All are
  // BBC section feeds on feeds.bbci.co.uk, the same host already
  // fetching cleanly for bbc-world / bbc-business / bbc-technology.
  {
    key: "bbc-sport",
    name: "BBC Sport",
    publisher: "BBC Sport",
    feedUrl: "https://feeds.bbci.co.uk/sport/rss.xml",
    homepageUrl: "https://www.bbc.com/sport",
    region: "GLOBAL",
    language: "en",
    topics: ["SPORTS"],
    trustTier: 2,
  },
  {
    key: "bbc-entertainment-arts",
    name: "BBC News — Entertainment & Arts",
    publisher: "BBC News",
    feedUrl: "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml",
    homepageUrl: "https://www.bbc.com/news/entertainment_and_arts",
    region: "GLOBAL",
    language: "en",
    topics: ["CULTURE", "ENTERTAINMENT"],
    trustTier: 2,
  },
  {
    key: "bbc-science-environment",
    name: "BBC News — Science & Environment",
    publisher: "BBC News",
    feedUrl: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml",
    homepageUrl: "https://www.bbc.com/news/science_and_environment",
    region: "GLOBAL",
    language: "en",
    topics: ["SCIENCE", "ENVIRONMENT", "CLIMATE"],
    trustTier: 2,
  },
  {
    key: "bbc-health",
    name: "BBC News — Health",
    publisher: "BBC News",
    feedUrl: "https://feeds.bbci.co.uk/news/health/rss.xml",
    homepageUrl: "https://www.bbc.com/news/health",
    region: "GLOBAL",
    language: "en",
    topics: ["HEALTH"],
    trustTier: 2,
  },
  // Second source for the two narrowest categories, on the Guardian's
  // own /rss pattern already fetching cleanly for guardian-world. A
  // category served by a single publisher goes dark the moment that
  // publisher does.
  {
    key: "guardian-sport",
    name: "The Guardian — Sport",
    publisher: "The Guardian",
    feedUrl: "https://www.theguardian.com/sport/rss",
    homepageUrl: "https://www.theguardian.com/sport",
    region: "GLOBAL",
    language: "en",
    topics: ["SPORTS"],
    trustTier: 2,
  },
  {
    key: "guardian-culture",
    name: "The Guardian — Culture",
    publisher: "The Guardian",
    feedUrl: "https://www.theguardian.com/culture/rss",
    homepageUrl: "https://www.theguardian.com/culture",
    region: "GLOBAL",
    language: "en",
    topics: ["CULTURE", "ENTERTAINMENT"],
    trustTier: 2,
  },
  /*
   * Business and Technology were the last two categories still resting
   * on a single publisher (bbc-business, bbc-technology). That is the
   * same shape that left Sports dark: one feed changes a path or has a
   * bad morning and the category is empty, with nothing to say why.
   *
   * Same URL pattern as the Guardian feeds already in this roster, two
   * of which the activation script fetched live in production
   * (guardian-sport 40 items, guardian-culture 21). The pattern is
   * proven; these two paths were not fetched from the machine this was
   * written on, which has no egress to theguardian.com - so the
   * activation script fetches every newly seeded source and disables
   * any that does not return usable items rather than leaving a dead
   * feed switched on.
   */
  {
    key: "guardian-business",
    name: "The Guardian — Business",
    publisher: "The Guardian",
    feedUrl: "https://www.theguardian.com/business/rss",
    homepageUrl: "https://www.theguardian.com/business",
    region: "GLOBAL",
    language: "en",
    topics: ["BUSINESS", "ECONOMY", "FINANCE"],
    trustTier: 2,
  },
  {
    key: "guardian-technology",
    name: "The Guardian — Technology",
    publisher: "The Guardian",
    feedUrl: "https://www.theguardian.com/technology/rss",
    homepageUrl: "https://www.theguardian.com/technology",
    region: "GLOBAL",
    language: "en",
    topics: ["TECHNOLOGY", "AI"],
    trustTier: 2,
  },

  // ─── Switzerland ──────────────────────────────────────────────
  // swissinfo-eng above is the only CH-tagged source and its feed path
  // returns a real 404, which is why the Switzerland category has
  // stayed empty. No verified replacement URL could be fetched from
  // this build environment, so these are candidates: the provisioning
  // script performs one live fetch of each and disables whichever does
  // not answer, rather than leaving a dead feed switched on.
  {
    key: "srf-news",
    name: "SRF News",
    publisher: "Schweizer Radio und Fernsehen (SRF)",
    feedUrl: "https://www.srf.ch/news/bnf/rss/1646",
    homepageUrl: "https://www.srf.ch/news",
    region: "EUROPE",
    country: "CH",
    language: "de",
    topics: ["WORLD", "POLITICS"],
    trustTier: 2,
  },
  {
    key: "admin-ch-releases",
    name: "Swiss Federal Administration — Media releases",
    publisher: "Swiss Federal Administration",
    feedUrl: "https://www.admin.ch/gov/en/start/documentation/media-releases.rss.html",
    homepageUrl: "https://www.admin.ch/gov/en/start/documentation/media-releases.html",
    region: "EUROPE",
    country: "CH",
    language: "en",
    topics: ["POLITICS", "WORLD"],
    trustTier: 1,
    official: true,
    fetchIntervalMinutes: 60,
  },

  // ─── Crypto (tier 3) ──────────────────────────────────────────
  // The general-news sources above cover crypto only when a story is
  // large enough to reach a mainstream business desk, so the CRYPTO
  // topic almost never fired. These are the established crypto trade
  // press, added so the ZRP Crypto desk has something to publish.
  // Tier 3, not 2: trade press covering an industry it is part of does
  // not corroborate a story the way an established general outlet
  // does, so a story resting on these alone stays DEVELOPING rather
  // than CONFIRMED (see assessConfidence in classify.ts).
  // ⚠️ Same caveat as every entry here: not fetched from this build
  // environment - verify before relying on it.
  {
    key: "coindesk",
    name: "CoinDesk",
    publisher: "CoinDesk",
    feedUrl: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    homepageUrl: "https://www.coindesk.com/",
    region: "GLOBAL",
    language: "en",
    topics: ["CRYPTO"],
    trustTier: 3,
  },
  {
    key: "cointelegraph",
    name: "Cointelegraph",
    publisher: "Cointelegraph",
    feedUrl: "https://cointelegraph.com/rss",
    homepageUrl: "https://cointelegraph.com/",
    region: "GLOBAL",
    language: "en",
    topics: ["CRYPTO"],
    trustTier: 3,
  },
  {
    key: "decrypt",
    name: "Decrypt",
    publisher: "Decrypt",
    feedUrl: "https://decrypt.co/feed",
    homepageUrl: "https://decrypt.co/",
    region: "GLOBAL",
    language: "en",
    topics: ["CRYPTO"],
    trustTier: 3,
  },

  // ─── Gaming (tier 2/3) ────────────────────────────────────────
  // Per-platform coverage so PlayStation, Nintendo and Xbox each have a
  // real dedicated source rather than relying on general-news outlets
  // to occasionally mention a console. All three are Hookshot Media
  // (formerly Nlife Media) sites on the same feeds.<brand>.com
  // platform as Eurogamer/Time Extension, each publisher-operated
  // specifically for machine consumption like every other source here.
  // ⚠️ Same caveat as every entry above: not fetched from this build
  // environment - verify before enabling.
  {
    key: "pushsquare-ps",
    name: "Push Square",
    publisher: "Push Square (Hookshot Media)",
    feedUrl: "https://www.pushsquare.com/feeds/latest",
    homepageUrl: "https://www.pushsquare.com/",
    region: "GLOBAL",
    language: "en",
    topics: ["GAMING"],
    trustTier: 3,
  },
  {
    key: "nintendolife",
    name: "Nintendo Life",
    publisher: "Nintendo Life (Hookshot Media)",
    feedUrl: "https://www.nintendolife.com/feeds/latest",
    homepageUrl: "https://www.nintendolife.com/",
    region: "GLOBAL",
    language: "en",
    topics: ["GAMING"],
    trustTier: 3,
  },
  {
    key: "purexbox",
    name: "Pure Xbox",
    publisher: "Pure Xbox (Hookshot Media)",
    feedUrl: "https://www.purexbox.com/feeds/latest",
    homepageUrl: "https://www.purexbox.com/",
    region: "GLOBAL",
    language: "en",
    topics: ["GAMING"],
    trustTier: 3,
  },
  {
    key: "playstation-blog",
    name: "PlayStation.Blog",
    publisher: "Sony Interactive Entertainment",
    feedUrl: "https://blog.playstation.com/feed/",
    homepageUrl: "https://blog.playstation.com/",
    region: "GLOBAL",
    language: "en",
    topics: ["GAMING"],
    trustTier: 1,
    official: true,
  },
  {
    key: "xbox-wire",
    name: "Xbox Wire",
    publisher: "Microsoft",
    feedUrl: "https://news.xbox.com/en-us/feed/",
    homepageUrl: "https://news.xbox.com/en-us/",
    region: "GLOBAL",
    language: "en",
    topics: ["GAMING"],
    trustTier: 1,
    official: true,
  },
];

export function seedSourceKeys(): string[] {
  return SEED_SOURCES.map((source) => source.key);
}
