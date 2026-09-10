import type { NewsRegion, NewsTopic, PrismaClient } from "@prisma/client";
import { COUNTRIES } from "./config";

/*
 * ============================================================
 * Editorial feed roster
 * ============================================================
 *
 * Every entry here is an openly-labelled ZRP editorial feed. None of
 * them is, or pretends to be, a person:
 *
 *  - names are all "ZRP <desk>", never a human name
 *  - bios say plainly that the account is an official automated ZRP
 *    editorial feed
 *  - User.isEditorialFeed is set, so the UI can label them
 *  - no birthday, no location claim, no invented biography
 *  - they are never given a password, so they cannot be signed into
 *
 * Provisioning creates them DISABLED. Enabling a feed is a separate,
 * audited admin action - installing this code cannot make 100 accounts
 * start posting.
 *
 * ⚠️ BRANDING: avatars and banners point at the existing official ZRP
 * assets in /public, used exactly as they are. No ZRP logo is created,
 * modified, recoloured or regenerated anywhere in this system.
 */

/*
 * Absolute, not root-relative: a relative path resolves fine in a
 * browser (against the page's own origin) but has no origin to resolve
 * against in the Android/iOS apps' image loaders, which silently fail
 * to load it - found via production evidence that editorial accounts
 * showed no avatar or cover on Android while working fine on web.
 */
export const EDITORIAL_AVATAR_URL = "https://zrp.one/icon-512.png";
export const EDITORIAL_COVER_URL = "https://zrp.one/og-image.png";

/**
 * The badge these accounts carry. Registered in VerifiedBadge.tsx with
 * its own glyph so it is never confused with the "journalist" badge a
 * real verified human journalist wears.
 */
export const EDITORIAL_BADGE_TYPE = "editorial";

/**
 * Addresses use the RFC 2606 reserved `.invalid` TLD. That TLD can
 * never be registered, so no OAuth provider can ever verify one of
 * these addresses and no sign-in flow can ever attach to an editorial
 * account by email.
 */
export const EDITORIAL_EMAIL_DOMAIN = "zrp-news.invalid";

export interface FeedDefinition {
  key: string;
  username: string;
  displayName: string;
  description: string;
  region: NewsRegion;
  country: string | null;
  language: string;
  timezone: string;
  topics: NewsTopic[];
  isPilot: boolean;
  minMinutesBetweenPosts: number;
  maxPostsPerDay: number;
}

function definition(partial: Omit<FeedDefinition, "isPilot" | "minMinutesBetweenPosts" | "maxPostsPerDay"> & Partial<FeedDefinition>): FeedDefinition {
  return {
    isPilot: false,
    minMinutesBetweenPosts: 180,
    maxPostsPerDay: 6,
    ...partial,
  };
}

const DESK_LABEL = "Official ZRP editorial feed · automated";

// ─── Global desks ────────────────────────────────────────────────────
const GLOBAL_DESKS: Array<{ key: string; name: string; topics: NewsTopic[] }> = [
  { key: "world", name: "ZRP News World", topics: ["WORLD"] },
  { key: "politics", name: "ZRP Politics", topics: ["POLITICS"] },
  { key: "business", name: "ZRP Business", topics: ["BUSINESS"] },
  { key: "economy", name: "ZRP Economy", topics: ["ECONOMY"] },
  { key: "technology", name: "ZRP Technology", topics: ["TECHNOLOGY"] },
  { key: "ai", name: "ZRP AI News", topics: ["AI"] },
  { key: "science", name: "ZRP Science", topics: ["SCIENCE"] },
  { key: "health", name: "ZRP Health", topics: ["HEALTH"] },
  { key: "crypto", name: "ZRP Crypto", topics: ["CRYPTO"] },
  { key: "finance", name: "ZRP Finance", topics: ["FINANCE"] },
  { key: "sports", name: "ZRP Sports", topics: ["SPORTS"] },
  { key: "entertainment", name: "ZRP Entertainment", topics: ["ENTERTAINMENT"] },
  { key: "culture", name: "ZRP Culture", topics: ["CULTURE"] },
  { key: "environment", name: "ZRP Environment", topics: ["ENVIRONMENT"] },
  { key: "climate", name: "ZRP Climate", topics: ["CLIMATE"] },
  { key: "security", name: "ZRP Security", topics: ["SECURITY"] },
  { key: "education", name: "ZRP Education", topics: ["EDUCATION"] },
  { key: "lifestyle", name: "ZRP Lifestyle", topics: ["LIFESTYLE"] },
  { key: "automotive", name: "ZRP Automotive", topics: ["AUTOMOTIVE"] },
  { key: "gaming", name: "ZRP Gaming", topics: ["GAMING"] },
  { key: "breaking", name: "ZRP Breaking News", topics: ["BREAKING"] },
];

// ─── Regional desks ──────────────────────────────────────────────────
const REGIONAL_DESKS: Array<{ key: string; name: string; region: NewsRegion; timezone: string }> = [
  { key: "europe", name: "ZRP News Europe", region: "EUROPE", timezone: "Europe/Zurich" },
  { key: "africa", name: "ZRP News Africa", region: "AFRICA", timezone: "Africa/Nairobi" },
  { key: "asia", name: "ZRP News Asia", region: "ASIA", timezone: "Asia/Singapore" },
  { key: "middle-east", name: "ZRP News Middle East", region: "MIDDLE_EAST", timezone: "Asia/Dubai" },
  { key: "north-america", name: "ZRP News North America", region: "NORTH_AMERICA", timezone: "America/New_York" },
  { key: "south-america", name: "ZRP News South America", region: "SOUTH_AMERICA", timezone: "America/Sao_Paulo" },
  { key: "oceania", name: "ZRP News Oceania", region: "OCEANIA", timezone: "Australia/Sydney" },
];

/*
 * ─── Travel desks ───────────────────────────────────────────────────
 *
 * ZRP's post model has no per-post language field, and the app-wide
 * language is a client preference rather than something the feed can
 * filter on. A single multilingual ZRP Travel account would therefore
 * show every reader all four languages interleaved, which is worse for
 * all four audiences than following one.
 *
 * So: one identity per language, each an obvious sibling of the others
 * ("ZRP Travel Français"), all publishing the same stories written
 * natively for that audience. That is four accounts because there are
 * four audiences - it is not four accounts inflating a number.
 */
const TRAVEL_DESKS: Array<{
  key: string;
  name: string;
  language: string;
  timezone: string;
  description: string;
  topics: NewsTopic[];
  isPilot: boolean;
}> = [
  {
    key: "travel-en",
    name: "ZRP Travel",
    language: "en",
    timezone: "Europe/Zurich",
    description: `${DESK_LABEL}. Travel, tourism and transport news in English: disruption, destinations, regulations and official advisories, with sources linked.`,
    topics: ["TRAVEL", "TOURISM", "TRANSPORTATION", "AVIATION"],
    isPilot: true,
  },
  {
    key: "travel-fr",
    name: "ZRP Travel Français",
    language: "fr",
    timezone: "Europe/Paris",
    description: `${DESK_LABEL}. Actualité voyage, tourisme et transport en français : perturbations, destinations, réglementations et avis officiels, avec liens vers les sources.`,
    topics: ["TRAVEL", "TOURISM", "TRANSPORTATION", "AVIATION"],
    isPilot: false,
  },
  {
    key: "travel-de",
    name: "ZRP Travel Deutsch",
    language: "de",
    timezone: "Europe/Berlin",
    description: `${DESK_LABEL}. Reise-, Tourismus- und Verkehrsnachrichten auf Deutsch: Störungen, Reiseziele, Vorschriften und offizielle Hinweise, mit Quellenangabe.`,
    topics: ["TRAVEL", "TOURISM", "TRANSPORTATION", "AVIATION"],
    isPilot: false,
  },
  {
    key: "travel-it",
    name: "ZRP Travel Italiano",
    language: "it",
    timezone: "Europe/Rome",
    description: `${DESK_LABEL}. Notizie su viaggi, turismo e trasporti in italiano: disagi, destinazioni, normative e avvisi ufficiali, con le fonti collegate.`,
    topics: ["TRAVEL", "TOURISM", "TRANSPORTATION", "AVIATION"],
    isPilot: false,
  },
  {
    key: "aviation",
    name: "ZRP Aviation",
    language: "en",
    timezone: "Europe/Zurich",
    description: `${DESK_LABEL}. Airports, airlines and flight disruption, from official announcements and established aviation reporting.`,
    topics: ["AVIATION"],
    isPilot: false,
  },
  {
    key: "tourism",
    name: "ZRP Tourism",
    language: "en",
    timezone: "Europe/Zurich",
    description: `${DESK_LABEL}. Destinations, tourism authorities and travel trends.`,
    topics: ["TOURISM"],
    isPilot: false,
  },
  {
    key: "transport",
    name: "ZRP Transport",
    language: "en",
    timezone: "Europe/Zurich",
    description: `${DESK_LABEL}. Rail, road, ferry and public transport news and disruption.`,
    topics: ["TRANSPORTATION"],
    isPilot: false,
  },
];

/** Countries whose national desks form part of the initial pilot. */
const PILOT_COUNTRIES = new Set(["CH", "FR", "DE", "IT"]);

function usernameFor(key: string): string {
  // Post/mention parsing across ZRP treats [a-zA-Z0-9_] as username
  // characters, so hyphens in a key become underscores here.
  return `zrp_${key.replace(/-/g, "_")}`;
}

/** The full editorial roster. Nothing in it is enabled by default. */
export function buildFeedRoster(): FeedDefinition[] {
  const feeds: FeedDefinition[] = [];

  for (const desk of GLOBAL_DESKS) {
    feeds.push(
      definition({
        key: `news-${desk.key}`,
        username: usernameFor(`news_${desk.key}`),
        displayName: desk.name,
        description: `${DESK_LABEL}. Concise original summaries with the original source linked on every post.`,
        region: "GLOBAL",
        country: null,
        language: "en",
        timezone: "UTC",
        topics: desk.topics,
        // ZRP News World anchors the pilot.
        isPilot: desk.key === "world",
        // The world desk sees the most candidate stories, so it gets the
        // tightest gap of any feed rather than the loosest.
        minMinutesBetweenPosts: desk.key === "world" ? 120 : 240,
        maxPostsPerDay: desk.key === "world" ? 8 : 4,
      })
    );
  }

  for (const desk of REGIONAL_DESKS) {
    feeds.push(
      definition({
        key: `news-${desk.key}`,
        username: usernameFor(`news_${desk.key}`),
        displayName: desk.name,
        description: `${DESK_LABEL}. Regional news summaries with the original source linked on every post.`,
        region: desk.region,
        country: null,
        language: "en",
        timezone: desk.timezone,
        topics: [],
        isPilot: false,
      })
    );
  }

  for (const desk of TRAVEL_DESKS) {
    feeds.push(
      definition({
        key: desk.key,
        username: usernameFor(desk.key),
        displayName: desk.name,
        description: desk.description,
        region: "GLOBAL",
        country: null,
        language: desk.language,
        timezone: desk.timezone,
        topics: desk.topics,
        isPilot: desk.isPilot,
        // Travel disruption is time-critical, so travel desks are
        // allowed to post more often than a general desk.
        minMinutesBetweenPosts: 120,
        maxPostsPerDay: 8,
      })
    );
  }

  for (const country of COUNTRIES) {
    feeds.push(
      definition({
        key: `news-${country.code.toLowerCase()}`,
        username: usernameFor(`news_${country.code.toLowerCase()}`),
        displayName: `ZRP News ${country.name}`,
        description: `${DESK_LABEL}. News from ${country.name}, summarised with the original source linked on every post.`,
        region: country.region,
        country: country.code,
        language: country.language,
        timezone: country.timezone,
        topics: [],
        isPilot: PILOT_COUNTRIES.has(country.code),
      })
    );
  }

  return feeds;
}

export function pilotFeedKeys(): string[] {
  return buildFeedRoster()
    .filter((feed) => feed.isPilot)
    .map((feed) => feed.key);
}

export interface ProvisionResult {
  created: string[];
  updated: string[];
  skipped: Array<{ key: string; reason: string }>;
}

/**
 * Creates or refreshes the editorial accounts for a set of feeds.
 *
 * Idempotent, and conservative about what it touches: an existing feed's
 * `enabled` flag, cadence and profile edits made by an admin are left
 * alone. Re-running provisioning never re-enables a feed someone turned
 * off, and never publishes anything.
 */
export async function provisionFeeds(
  db: PrismaClient,
  definitions: FeedDefinition[]
): Promise<ProvisionResult> {
  const result: ProvisionResult = { created: [], updated: [], skipped: [] };

  for (const feed of definitions) {
    try {
      const existing = await db.newsFeed.findUnique({
        where: { key: feed.key },
        select: { id: true },
      });

      if (existing) {
        await db.newsFeed.update({
          where: { id: existing.id },
          data: {
            displayName: feed.displayName,
            description: feed.description,
            region: feed.region,
            country: feed.country,
            language: feed.language,
            timezone: feed.timezone,
            topics: feed.topics,
            isPilot: feed.isPilot,
            // `enabled`, `minMinutesBetweenPosts` and `maxPostsPerDay`
            // are intentionally absent: those are operational settings
            // an admin owns, not something a redeploy overwrites.
          },
        });
        result.updated.push(feed.key);
        continue;
      }

      // A human user may already hold this username. Never take it, and
      // never silently pick a different one - report it and move on.
      const usernameTaken = await db.user.findUnique({
        where: { username: feed.username },
        select: { id: true, isEditorialFeed: true },
      });

      if (usernameTaken && !usernameTaken.isEditorialFeed) {
        result.skipped.push({
          key: feed.key,
          reason: `Username @${feed.username} is already held by a non-editorial account`,
        });
        continue;
      }

      await db.$transaction(async (tx) => {
        const user = usernameTaken
          ? await tx.user.update({
              where: { id: usernameTaken.id },
              data: {
                name: feed.displayName,
                bio: feed.description,
                isEditorialFeed: true,
                badgeType: EDITORIAL_BADGE_TYPE,
              },
              select: { id: true },
            })
          : await tx.user.create({
              data: {
                email: `${feed.key}@${EDITORIAL_EMAIL_DOMAIN}`,
                username: feed.username,
                name: feed.displayName,
                bio: feed.description,
                // No password: these accounts cannot be signed into.
                password: null,
                avatarUrl: EDITORIAL_AVATAR_URL,
                coverUrl: EDITORIAL_COVER_URL,
                isEditorialFeed: true,
                badgeType: EDITORIAL_BADGE_TYPE,
                category: "News",
                onboardingCompleted: true,
                emailVerified: new Date(),
              },
              select: { id: true },
            });

        await tx.newsFeed.create({
          data: {
            key: feed.key,
            displayName: feed.displayName,
            description: feed.description,
            userId: user.id,
            region: feed.region,
            country: feed.country,
            language: feed.language,
            timezone: feed.timezone,
            topics: feed.topics,
            enabled: false,
            isPilot: feed.isPilot,
            minMinutesBetweenPosts: feed.minMinutesBetweenPosts,
            maxPostsPerDay: feed.maxPostsPerDay,
          },
        });
      });

      result.created.push(feed.key);
    } catch (error) {
      result.skipped.push({
        key: feed.key,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
