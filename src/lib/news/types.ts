import type { NewsRegion, NewsTopic, NewsConfidence } from "@prisma/client";

// The four languages ZRP Travel News must always be available in. These
// are all already members of the app-wide `Language` union in
// src/lib/translations.ts - the `satisfies` below is what guarantees we
// never ship a news language the rest of ZRP cannot render.
export const TRAVEL_LANGUAGES = ["en", "fr", "de", "it"] as const;

export type NewsLanguage = (typeof TRAVEL_LANGUAGES)[number];

/** One item as it came off a source feed, before any dedup or AI. */
export interface RawFeedItem {
  title: string;
  link: string;
  // Whatever short description/summary the publisher chose to put in
  // their own feed. Never the full article body: we do not fetch, store
  // or republish article text.
  summary: string | null;
  publishedAt: Date | null;
  imageUrl: string | null;
  guid: string | null;
}

/** A story candidate after classification, before persistence. */
export interface StoryCandidate {
  title: string;
  normalizedTitle: string;
  fingerprint: string;
  sourceMaterial: string;
  topic: NewsTopic;
  region: NewsRegion;
  country: string | null;
  language: string;
  isTravel: boolean;
  isBreaking: boolean;
  sensitive: boolean;
  confidence: NewsConfidence;
  importance: number;
  imageUrl: string | null;
}

/** Result of the groundedness check run over generated text. */
export interface GroundednessReport {
  ok: boolean;
  unsupportedNumbers: string[];
  fabricatedQuotes: number;
  injectedUrls: string[];
  tooLong: boolean;
  tooShort: boolean;
}
