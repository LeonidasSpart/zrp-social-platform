import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { randomUUID } from "crypto";

const { safeFetch, isFeedUrlAllowed, generateRenditions } = vi.hoisted(() => ({
  safeFetch: vi.fn(),
  isFeedUrlAllowed: vi.fn(),
  generateRenditions: vi.fn(),
}));

vi.mock("@/lib/ssrf-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ssrf-guard")>();
  return { ...actual, safeFetch };
});
vi.mock("../robots", () => ({ isFeedUrlAllowed }));
// Spread the real module so only generateRenditions is stubbed: the
// pipeline also imports the model timeout/retry constants from here,
// and a bare object mock silently turns those into undefined.
vi.mock("../generate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../generate")>();
  return { ...actual, generateRenditions };
});

import { prisma } from "@/lib/db";
import { runPipelineCycle } from "../pipeline";
import { SETTINGS_ID } from "../settings";
import { isNewsLanguage, TRAVEL_LANGUAGES } from "../config";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

const db = prisma;
const CYCLE_AT = new Date("2026-02-03T12:00:00Z");

function rssFor(items: Array<{ title: string; link: string; summary: string }>): string {
  return `<?xml version="1.0"?><rss version="2.0"><channel>${items
    .map(
      (item) =>
        `<item><title>${item.title}</title><link>${item.link}</link><description>${item.summary}</description><pubDate>${CYCLE_AT.toUTCString()}</pubDate></item>`
    )
    .join("")}</channel></rss>`;
}

function fetchResult(body: string) {
  return { statusCode: 200, headers: {}, body: Buffer.from(body, "utf-8") };
}

const HEADLINES: Record<string, string> = {
  en: "Example Test Airport suspends departures after overnight storm",
  fr: "L'aéroport de test suspend les départs après une tempête nocturne",
  de: "Test-Flughafen setzt Abflüge nach nächtlichem Sturm aus",
  it: "L'aeroporto di test sospende le partenze dopo una tempesta notturna",
};

const BODIES: Record<string, string> = {
  en: "Departures are suspended.\n\nThe authority expects operations to resume at midday.",
  fr: "Les départs sont suspendus.\n\nL'autorité prévoit une reprise à la mi-journée.",
  de: "Abflüge sind ausgesetzt.\n\nDie Behörde erwartet eine Wiederaufnahme am Mittag.",
  it: "Le partenze sono sospese.\n\nL'autorità prevede una ripresa a metà giornata.",
};

function okRendition(language: string) {
  return {
    language,
    rendition: {
      headline: HEADLINES[language],
      body: BODIES[language],
      model: "test",
      validation: {
        ok: true,
        unsupportedNumbers: [],
        fabricatedQuotes: 0,
        injectedUrls: [],
        tooLong: false,
        tooShort: false,
      },
    },
    error: null,
    validation: null,
  };
}

/*
 * Two different failures live here and the pipeline tells them apart by
 * whether a validator report came back: a groundedness refusal carries
 * one (the story is genuinely rejected), while a skipped localisation
 * or a provider fault does not (the story is kept for another cycle).
 */
function rejectedRendition(language: string, error: string) {
  return {
    language,
    rendition: null,
    error,
    validation: {
      ok: false,
      unsupportedNumbers: ["870"],
      fabricatedQuotes: 0,
      injectedUrls: [],
      tooLong: false,
      tooShort: false,
    },
  };
}

function failedRendition(language: string, error: string) {
  return { language, rendition: null, error, validation: null };
}

describe.skipIf(!hasRealDatabaseUrl)(
  "multilingual pipeline (integration, real Postgres)",
  () => {
    const suffix = randomUUID().slice(0, 8);
    const sourceKey = `ml-src-${suffix}`;
    const feedKeys: Record<string, string> = {
      en: `ml-feed-en-${suffix}`,
      fr: `ml-feed-fr-${suffix}`,
      de: `ml-feed-de-${suffix}`,
      it: `ml-feed-it-${suffix}`,
    };

    const feedIds: Record<string, string> = {};
    const userIds: Record<string, string> = {};

    beforeAll(async () => {
      for (const language of TRAVEL_LANGUAGES) {
        const user = await db.user.create({
          data: {
            email: `${feedKeys[language]}@zrp-news.invalid`,
            username: `zrp_ml_${language}_${suffix}`,
            name: `ZRP Travel Test ${language.toUpperCase()}`,
            bio: "Official ZRP editorial feed · automated. Test fixture.",
            isEditorialFeed: true,
            badgeType: "editorial",
          },
          select: { id: true },
        });
        userIds[language] = user.id;

        const feed = await db.newsFeed.create({
          data: {
            key: feedKeys[language],
            displayName: `ZRP Travel Test ${language.toUpperCase()}`,
            userId: user.id,
            region: "GLOBAL",
            language,
            timezone: "UTC",
            topics: ["TRAVEL", "TOURISM", "TRANSPORTATION", "AVIATION"],
            enabled: true,
            minMinutesBetweenPosts: 30,
            maxPostsPerDay: 10,
          },
        });
        feedIds[language] = feed.id;
      }

      await db.newsSource.create({
        data: {
          key: sourceKey,
          name: "Example Test Authority",
          publisher: "Example Test Authority",
          feedUrl: `https://authority.example/${suffix}/feed.xml`,
          region: "GLOBAL",
          language: "en",
          trustTier: 1,
          official: true,
          fetchIntervalMinutes: 15,
        },
      });
    });

    afterAll(async () => {
      if (!hasRealDatabaseUrl) return;
      const ids = Object.values(feedIds);
      await db.newsPublication.deleteMany({ where: { feedId: { in: ids } } });
      await db.newsStory.deleteMany({
        where: { references: { some: { source: { key: sourceKey } } } },
      });
      await db.newsSource.deleteMany({ where: { key: sourceKey } });
      await db.newsFeed.deleteMany({ where: { id: { in: ids } } });
      await db.post.deleteMany({ where: { authorId: { in: Object.values(userIds) } } });
      await db.user.deleteMany({ where: { id: { in: Object.values(userIds) } } });
    });

    beforeEach(async () => {
      vi.clearAllMocks();
      isFeedUrlAllowed.mockResolvedValue(true);

      const ids = Object.values(feedIds);
      await db.newsPublication.deleteMany({ where: { feedId: { in: ids } } });
      await db.post.deleteMany({ where: { authorId: { in: Object.values(userIds) } } });
      await db.newsStory.deleteMany({
        where: { references: { some: { source: { key: sourceKey } } } },
      });
      await db.newsSource.updateMany({
        where: { key: sourceKey },
        data: {
          enabled: true,
          lastFetchedAt: null,
          backoffUntil: null,
          consecutiveFailures: 0,
          status: "HEALTHY",
          etag: null,
          lastModified: null,
        },
      });
      await db.newsFeed.updateMany({
        where: { id: { in: ids } },
        data: { enabled: true, lastPublishedAt: null },
      });

      await db.newsAutomationSetting.upsert({
        where: { id: SETTINGS_ID },
        update: { paused: false, enabledLanguages: ["en", "fr", "de", "it"] },
        create: { id: SETTINGS_ID, paused: false, enabledLanguages: ["en", "fr", "de", "it"] },
      });

      safeFetch.mockResolvedValue(
        fetchResult(
          rssFor([
            {
              title: "Example Test Airport suspends departures after overnight storm",
              link: `https://authority.example/${suffix}/travel-story`,
              summary: "Departures are suspended until midday.",
            },
          ])
        )
      );
    });

    async function runCycle(at: Date = CYCLE_AT) {
      return runPipelineCycle({ trigger: "manual", now: at, db, skipLock: true });
    }

    async function theStory() {
      return db.newsStory.findFirstOrThrow({
        where: { references: { some: { source: { key: sourceKey } } } },
        include: { renditions: true, publications: true },
      });
    }

    it("publishes one travel story into all four languages, bound to the same event", async () => {
      generateRenditions.mockImplementation(async (languages: string[]) =>
        languages.map(okRendition)
      );

      await runCycle();

      const story = await theStory();

      // One event, four localisations - not four events.
      expect(story.renditions).toHaveLength(4);
      expect(story.renditions.map((r) => r.language).sort()).toEqual(["de", "en", "fr", "it"]);
      expect(story.renditions.every((r) => r.status === "READY")).toBe(true);
      expect(story.renditions.every((r) => r.storyId === story.id)).toBe(true);

      expect(story.publications).toHaveLength(4);
      expect(story.publications.map((p) => p.language).sort()).toEqual(["de", "en", "fr", "it"]);
      expect(story.status).toBe("PUBLISHED");

      // Each language went to the feed that speaks it, and each post
      // carries that language's own text.
      for (const language of TRAVEL_LANGUAGES) {
        const publication = story.publications.find((p) => p.language === language)!;
        expect(publication.feedId).toBe(feedIds[language]);
        expect(publication.status).toBe("PUBLISHED");

        const post = await db.post.findUniqueOrThrow({ where: { id: publication.postId! } });
        expect(post.content).toContain(HEADLINES[language]);
        expect(post.authorId).toBe(userIds[language]);
      }
    });

    it("uses each language's own labels, not a translated English post", async () => {
      generateRenditions.mockImplementation(async (languages: string[]) =>
        languages.map(okRendition)
      );

      await runCycle();
      const story = await theStory();

      const contentFor = async (language: string) => {
        const publication = story.publications.find((p) => p.language === language)!;
        const post = await db.post.findUniqueOrThrow({ where: { id: publication.postId! } });
        return post.content;
      };

      expect(await contentFor("en")).toContain("TRAVEL UPDATE");
      expect(await contentFor("fr")).toContain("INFO VOYAGE");
      expect(await contentFor("de")).toContain("REISE-UPDATE");
      expect(await contentFor("it")).toContain("AGGIORNAMENTO VIAGGI");

      expect(await contentFor("de")).toContain("Quelle");
      expect(await contentFor("it")).toContain("Fonte");
    });

    it("publishes the healthy languages and withholds only the one that failed", async () => {
      // French fails groundedness; the other three are fine.
      generateRenditions.mockImplementation(async (languages: string[]) =>
        languages.map((language) =>
          language === "fr"
            ? rejectedRendition("fr", "unsupported figures: 870")
            : okRendition(language)
        )
      );

      await runCycle();
      const story = await theStory();

      const french = story.renditions.find((r) => r.language === "fr")!;
      expect(french.status).toBe("FAILED");
      expect(french.error).toContain("870");

      // No French publication, and definitely no French post.
      expect(story.publications.map((p) => p.language).sort()).toEqual(["de", "en", "it"]);
      expect(
        await db.post.count({ where: { authorId: userIds.fr } })
      ).toBe(0);

      // The other three are unaffected - a partial failure is not an
      // all-or-nothing outage.
      expect(story.status).toBe("PUBLISHED");
      expect(await db.post.count({ where: { authorId: userIds.en } })).toBe(1);
      expect(await db.post.count({ where: { authorId: userIds.de } })).toBe(1);
      expect(await db.post.count({ where: { authorId: userIds.it } })).toBe(1);
    });

    it("publishes nothing in any language when English fails validation", async () => {
      generateRenditions.mockImplementation(async (languages: string[]) =>
        languages.map((language) =>
          language === "en"
            ? rejectedRendition("en", "unsupported figures: 870")
            : failedRendition(
                language,
                "Skipped: the English summary failed validation, so no localisation was attempted"
              )
        )
      );

      await runCycle();
      const story = await theStory();

      expect(story.publications).toHaveLength(0);
      expect(story.status).toBe("REJECTED");
      for (const language of TRAVEL_LANGUAGES) {
        expect(await db.post.count({ where: { authorId: userIds[language] } })).toBe(0);
      }
    });

    it("reaches the remaining languages in a later cycle after English published first", async () => {
      // Regression: publishing in English flips the story to PUBLISHED.
      // A planner that only looked at READY stories stranded FR/DE/IT.
      await db.newsFeed.updateMany({
        where: { id: { in: [feedIds.fr, feedIds.de, feedIds.it] } },
        data: { enabled: false },
      });

      generateRenditions.mockImplementation(async (languages: string[]) =>
        languages.map(okRendition)
      );

      await runCycle();

      let story = await theStory();
      expect(story.status).toBe("PUBLISHED");
      expect(story.publications.map((p) => p.language)).toEqual(["en"]);

      // The other desks come online.
      await db.newsFeed.updateMany({
        where: { id: { in: [feedIds.fr, feedIds.de, feedIds.it] } },
        data: { enabled: true },
      });

      await runCycle(new Date(CYCLE_AT.getTime() + 60 * 60 * 1000));

      story = await theStory();
      expect(story.publications.map((p) => p.language).sort()).toEqual([
        "de",
        "en",
        "fr",
        "it",
      ]);

      // Still exactly one publication per language.
      expect(new Set(story.publications.map((p) => p.language)).size).toBe(4);
      expect(story.publications).toHaveLength(4);
    });

    it("cannot publish the same language twice however many cycles run", async () => {
      generateRenditions.mockImplementation(async (languages: string[]) =>
        languages.map(okRendition)
      );

      await runCycle();
      await runCycle(new Date(CYCLE_AT.getTime() + 60 * 60 * 1000));
      await runCycle(new Date(CYCLE_AT.getTime() + 2 * 60 * 60 * 1000));

      const story = await theStory();

      expect(story.publications).toHaveLength(4);
      const totalPosts = await db.post.count({
        where: { authorId: { in: Object.values(userIds) } },
      });
      expect(totalPosts).toBe(4);
    });

    it("only generates the languages a non-travel story actually needs", async () => {
      safeFetch.mockResolvedValue(
        fetchResult(
          rssFor([
            {
              title: "Example Test Authority publishes its quarterly budget report",
              link: `https://authority.example/${suffix}/budget`,
              summary: "The report covers the last quarter.",
            },
          ])
        )
      );

      generateRenditions.mockImplementation(async (languages: string[]) =>
        languages.map(okRendition)
      );

      await runCycle();

      // A non-travel story is written for English plus its own source
      // language - not translated into all four for no reason.
      const requested = generateRenditions.mock.calls[0]?.[0] as string[];
      expect(requested).toEqual(["en"]);
    });

    it("leaves a story NEW, not REJECTED, when the generation budget runs out", async () => {
      // A cycle that ran out of wall-clock time has learned nothing about
      // the story's quality. Rejecting it would silently discard good
      // news; leaving it NEW makes it the next cycle's first pick.
      generateRenditions.mockImplementation(async (languages: string[]) =>
        languages.map((language) => ({
          language,
          rendition: null,
          error: "Skipped: the cycle's generation budget was exhausted before this language was attempted",
          validation: null,
          skippedForBudget: true,
        }))
      );

      const result = await runCycle();

      const story = await theStory();
      expect(story.status).toBe("NEW");
      expect(story.rejectionReason).toBeNull();
      expect(result.generationBudgetExhausted).toBe(true);

      // Nothing published, and nothing counted as a generation failure -
      // an unattempted language is not a failed one.
      expect(story.publications).toHaveLength(0);
      expect(result.renditionsFailed).toBe(0);
      expect(story.renditions).toHaveLength(0);
    });

    it("picks the skipped story up on the next cycle", async () => {
      let budgetExhausted = true;
      generateRenditions.mockImplementation(async (languages: string[]) =>
        languages.map((language) =>
          budgetExhausted
            ? {
                language,
                rendition: null,
                error: "Skipped: the cycle's generation budget was exhausted before this language was attempted",
                validation: null,
                skippedForBudget: true,
              }
            : okRendition(language)
        )
      );

      await runCycle();
      expect((await theStory()).status).toBe("NEW");

      // Next cycle has budget again.
      budgetExhausted = false;
      await runCycle(new Date(CYCLE_AT.getTime() + 60 * 60 * 1000));

      const story = await theStory();
      expect(story.status).toBe("PUBLISHED");
      expect(story.publications).toHaveLength(4);
    });

    it("refuses to enable a language the news system does not support", async () => {
      // ZRP itself supports 11 languages; ZRP News deliberately supports
      // four, and the guard is a real one rather than a convention.
      expect(isNewsLanguage("es")).toBe(false);
      expect(isNewsLanguage("ar")).toBe(false);
      expect(TRAVEL_LANGUAGES.every(isNewsLanguage)).toBe(true);
    });

    it("ignores an unsupported language even if one is forced into settings", async () => {
      // Simulates a settings row written before the validation existed.
      await db.newsAutomationSetting.update({
        where: { id: SETTINGS_ID },
        data: { enabledLanguages: ["en", "es"] },
      });

      generateRenditions.mockImplementation(async (languages: string[]) =>
        languages.map(okRendition)
      );

      await runCycle();

      const requested = generateRenditions.mock.calls[0]?.[0] as string[];
      expect(requested).not.toContain("es");
      expect(requested).toEqual(["en"]);

      const story = await theStory();
      expect(story.publications.every((p) => p.language !== "es")).toBe(true);
    });
  }
);
