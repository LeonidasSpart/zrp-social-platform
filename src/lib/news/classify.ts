import type { NewsTopic, NewsRegion, NewsConfidence } from "@prisma/client";
import { normalizeText } from "./dedupe";

/*
 * Keyword classification of an ingested item.
 *
 * Deliberately rule-based rather than model-based: classification runs
 * on every item of every fetch, it must be deterministic (the same
 * headline must always land in the same feed), and it must be testable
 * without a network call. The model is used for writing, not for
 * deciding what something is.
 */

const TOPIC_KEYWORDS: Array<{ topic: NewsTopic; weight: number; words: string[] }> = [
  { topic: "AVIATION", weight: 3, words: ["airport", "airline", "flight", "aviation", "runway", "boeing", "airbus", "aeroport", "flughafen", "aeroporto", "volo", "vol"] },
  { topic: "TRAVEL", weight: 3, words: ["travel", "traveller", "traveler", "tourist", "visa", "passport", "border crossing", "travel advisory", "voyage", "reise", "viaggio"] },
  { topic: "TOURISM", weight: 3, words: ["tourism", "destination", "hotel", "resort", "sightseeing", "tourisme", "tourismus", "turismo"] },
  { topic: "TRANSPORTATION", weight: 3, words: ["rail", "railway", "train", "metro", "ferry", "highway", "motorway", "bus service", "bahn", "treno"] },
  {
    topic: "CRYPTO",
    weight: 3,
    words: [
      "crypto", "cryptocurrency", "cryptocurrencies", "digital currency", "bitcoin", "ethereum",
      "blockchain", "stablecoin", "defi", "coinbase", "binance",
      // Added after auditing real crypto headlines against this list: an
      // altcoin, Web3 or NFT story - all explicitly part of the beat -
      // matched none of the words above and fell through to WORLD. Only
      // unambiguous crypto-specific terms, or phrases too specific to a
      // generic "exchange"/"regulation" story to false-positive on one.
      "altcoin", "altcoins", "web3", "nft", "nfts", "cbdc", "smart contract",
      "token sale", "layer 2", "crypto exchange", "crypto regulation",
    ],
  },
  { topic: "GAMING", weight: 3, words: ["playstation", "nintendo", "xbox", "video game", "video games", "esports", "esport", "game awards", "steam deck", "game studio"] },
  { topic: "AI", weight: 3, words: ["artificial intelligence", "machine learning", "chatbot", "llm", "neural network", "openai", "anthropic"] },
  { topic: "CLIMATE", weight: 2, words: ["climate", "emissions", "global warming", "carbon", "cop29", "cop30", "klima", "clima"] },
  { topic: "ENVIRONMENT", weight: 2, words: ["environment", "pollution", "wildlife", "biodiversity", "deforestation", "recycling"] },
  { topic: "HEALTH", weight: 2, words: ["health", "hospital", "vaccine", "outbreak", "disease", "who", "epidemic", "sante", "gesundheit", "salute"] },
  { topic: "SECURITY", weight: 2, words: ["security", "cyberattack", "breach", "ransomware", "defence", "defense", "military", "police operation"] },
  { topic: "TECHNOLOGY", weight: 2, words: ["technology", "software", "semiconductor", "chip", "app", "startup", "cloud computing", "technologie", "tecnologia"] },
  { topic: "SCIENCE", weight: 2, words: ["research", "scientists", "study finds", "space", "nasa", "esa", "telescope", "physics", "wissenschaft", "scienza"] },
  { topic: "FINANCE", weight: 2, words: ["bank", "interest rate", "central bank", "bond", "stock market", "shares", "investor", "banque", "borsa"] },
  { topic: "ECONOMY", weight: 2, words: ["economy", "inflation", "gdp", "unemployment", "recession", "trade deficit", "economie", "wirtschaft", "economia"] },
  { topic: "BUSINESS", weight: 2, words: ["company", "acquisition", "merger", "earnings", "revenue", "ceo", "layoffs", "entreprise", "unternehmen", "azienda"] },
  { topic: "POLITICS", weight: 2, words: ["election", "parliament", "president", "minister", "government", "senate", "vote", "coalition", "politique", "regierung", "governo"] },
  { topic: "SPORTS", weight: 2, words: ["match", "tournament", "league", "olympic", "world cup", "championship", "football", "tennis", "formula 1"] },
  { topic: "ENTERTAINMENT", weight: 2, words: ["film", "movie", "album", "festival", "actor", "streaming series", "box office"] },
  { topic: "CULTURE", weight: 2, words: ["museum", "exhibition", "heritage", "art", "literature", "theatre", "kultur", "cultura"] },
  { topic: "EDUCATION", weight: 2, words: ["school", "university", "student", "curriculum", "tuition", "ecole", "universite", "schule"] },
  { topic: "AUTOMOTIVE", weight: 2, words: ["car maker", "carmaker", "electric vehicle", "automotive", "vehicle recall", "auto industry"] },
  { topic: "LIFESTYLE", weight: 1, words: ["lifestyle", "wellness", "fashion", "cuisine", "recipe", "design trend"] },
];

/** Words that mark a story as breaking. Never enough on their own. */
const BREAKING_WORDS = [
  "breaking", "urgent", "just in", "emergency", "evacuation", "grounded",
  "shut down", "suspended", "cancelled all", "state of emergency",
];

/**
 * Topics where an automated summary can do real harm if it is wrong.
 * A story matching these is flagged sensitive and, while
 * `requireHumanReviewForSensitive` is on (the default), never
 * auto-publishes - it waits in the admin queue for a person.
 */
const SENSITIVE_WORDS = [
  "killed", "dead", "death toll", "casualties", "shooting", "stabbing", "terror",
  "terrorist", "bomb", "explosion", "attack", "war", "invasion", "airstrike",
  "massacre", "genocide", "hostage", "kidnap", "assassination", "coup",
  "rape", "abuse", "trafficking", "suicide", "overdose", "missing child",
  "court finds", "convicted", "acquitted", "indicted", "lawsuit against",
  "allegation", "alleged", "accused", "arrested", "investigation into",
  "outbreak", "pandemic", "recall", "contaminated", "crash", "derailment",
];

/**
 * Hedging language: a source that is itself unsure makes us unsure.
 *
 * "claims"/"claimed" appear here only in the hedging construction
 * ("claims that", "claimed to"). On their own they are ordinary sports
 * and business usage - a driver claims pole, a team claims the title -
 * and flagging those as unconfirmed blocked real, well-sourced stories
 * from publishing at all.
 */
const UNCONFIRMED_WORDS = [
  "reportedly", "rumour", "rumor", "unconfirmed", "sources say", "sources said",
  "claims that", "claimed that", "claims to", "claimed to",
  "allegedly", "speculation", "may have", "could have",
  "is said to",
];

/*
 * Whole-word matching for the three keyword detectors below.
 *
 * They used a raw substring test, which quietly produced nonsense:
 * "coup" fired on "a couple of late goals", so an ordinary sports
 * report was flagged sensitive and held from publication forever; and
 * "claimed" fired on "acclaimed" and "reclaimed", so a critically
 * acclaimed film or a reclaimed title scored as an unconfirmed rumour
 * and never reached its category.
 *
 * Unlike the topic keywords - where an inflection really does change
 * the meaning, hence "chip" not firing on "chipping" - a harm or a
 * hedge reads the same in any tense, so common English inflections
 * count: "crash" must still match "crashed", "recall" must still match
 * "recalled". Multi-word phrases work unchanged, because the text is
 * normalized to single spaces first.
 */
function containsWord(haystack: string, word: string): boolean {
  const escaped = normalizeText(word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^| )${escaped}(s|es|ed|ing)?( |$)`).test(haystack);
}

export function classifyTopic(title: string, summary: string | null): NewsTopic {
  const haystack = normalizeText(`${title} ${summary ?? ""}`);

  let bestTopic: NewsTopic = "WORLD";
  let bestScore = 0;

  for (const entry of TOPIC_KEYWORDS) {
    let score = 0;
    for (const word of entry.words) {
      // Word-boundary-ish match on the normalized (punctuation-free)
      // text, so "chip" does not fire on "chipping".
      if (new RegExp(`(^| )${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(haystack)) {
        score += entry.weight;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestTopic = entry.topic;
    }
  }

  return bestTopic;
}

export function detectBreaking(title: string, summary: string | null): boolean {
  const haystack = normalizeText(`${title} ${summary ?? ""}`);
  return BREAKING_WORDS.some((word) => containsWord(haystack, word));
}

export function detectSensitive(title: string, summary: string | null): boolean {
  const haystack = normalizeText(`${title} ${summary ?? ""}`);
  return SENSITIVE_WORDS.some((word) => containsWord(haystack, word));
}

/**
 * Confidence for a story, given how many independent sources report it
 * and the best trust tier among them.
 *
 * CONFIRMED requires either an official/authority source (tier 1) or
 * two independent established outlets. Everything else is DEVELOPING,
 * and hedged language drops it to UNCONFIRMED. Nothing here ever
 * upgrades a story because it is popular.
 */
export function assessConfidence(params: {
  sourceCount: number;
  bestTrustTier: number;
  titles: string[];
  summaries: (string | null)[];
}): NewsConfidence {
  const { sourceCount, bestTrustTier, titles, summaries } = params;

  const haystack = normalizeText(`${titles.join(" ")} ${summaries.filter(Boolean).join(" ")}`);
  const hedged = UNCONFIRMED_WORDS.some((word) => containsWord(haystack, word));

  if (hedged) return "UNCONFIRMED";
  if (bestTrustTier <= 1) return "CONFIRMED";
  if (sourceCount >= 2 && bestTrustTier <= 2) return "CONFIRMED";
  return "DEVELOPING";
}

/**
 * Region for a story, taken from its source. Country-level attribution
 * comes from the source's own country - we do not guess a location from
 * headline text, because guessing wrong misfiles a story into the wrong
 * national feed.
 */
export function resolveRegion(sourceRegion: NewsRegion): NewsRegion {
  return sourceRegion;
}
