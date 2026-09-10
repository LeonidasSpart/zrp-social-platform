import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { randomUUID } from "crypto";

const { safeFetch, isFeedUrlAllowed, generateRenditions } = vi.hoisted(() => ({
  safeFetch: vi.fn(),
  isFeedUrlAllowed: vi.fn(),
  generateRenditions: vi.fn(),
}));

// The pipeline's three outside-world edges. Everything else in this test
// - Prisma, dedupe, classification, ranking, scheduling, publication -
// is the real implementation against a real database.
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

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

const db = prisma;

/*
 * `publishedAt` becomes the story's firstSeenAt, which is what its age
 * is measured from - so a test driving a simulated clock has to date
 * its items on that clock, not on the wall clock.
 */
function rssFor(
  items: Array<{ title: string; link: string; summary: string }>,
  publishedAt: Date = new Date()
): string {
  return `<?xml version="1.0"?><rss version="2.0"><channel>${items
    .map(
      (item) =>
        `<item><title>${item.title}</title><link>${item.link}</link><description>${item.summary}</description><pubDate>${publishedAt.toUTCString()}</pubDate></item>`
    )
    .join("")}</channel></rss>`;
}

function fetchResult(body: string) {
  return { statusCode: 200, headers: {}, body: Buffer.from(body, "utf-8") };
}

describe.skipIf(!hasRealDatabaseUrl)("editorial pipeline (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const sourceKeys = [`p-src-a-${suffix}`, `p-src-b-${suffix}`, `p-src-c-${suffix}`];
  const feedKey = `p-feed-${suffix}`;

  let feedUserId: string;
  let feedId: string;

  beforeAll(async () => {
    const user = await db.user.create({
      data: {
        email: `${feedKey}@zrp-news.invalid`,
        username: `zrp_p_${suffix}`,
        name: "ZRP News Pipeline Test",
        bio: "Official ZRP editorial feed · automated. Test fixture.",
        isEditorialFeed: true,
        badgeType: "editorial",
      },
      select: { id: true },
    });
    feedUserId = user.id;

    const feed = await db.newsFeed.create({
      data: {
        key: feedKey,
        displayName: "ZRP News Pipeline Test",
        userId: feedUserId,
        region: "GLOBAL",
        language: "en",
        // UTC so the quiet-hours rule is deterministic regardless of when
        // the suite runs; the cycle below uses a fixed midday instant.
        timezone: "UTC",
        enabled: true,
        minMinutesBetweenPosts: 30,
        maxPostsPerDay: 10,
      },
    });
    feedId = feed.id;

    // Three independent outlets, all tier 2, all about to report the
    // same event in their own words.
    for (let index = 0; index < sourceKeys.length; index += 1) {
      const key = sourceKeys[index];
      await db.newsSource.create({
        data: {
          key,
          name: `Outlet ${index}`,
          publisher: `Outlet ${index}`,
          feedUrl: `https://outlet${index}.example/${suffix}/feed.xml`,
          region: "GLOBAL",
          language: "en",
          trustTier: 2,
          fetchIntervalMinutes: 15,
        },
      });
    }
  });

  afterAll(async () => {
    if (!hasRealDatabaseUrl) return;
    await db.newsPublication.deleteMany({ where: { feedId } });
    await db.newsStory.deleteMany({
      where: { references: { some: { source: { key: { in: sourceKeys } } } } },
    });
    await db.newsSource.deleteMany({ where: { key: { in: sourceKeys } } });
    await db.newsFeed.deleteMany({ where: { id: feedId } });
    await db.post.deleteMany({ where: { authorId: feedUserId } });
    await db.user.deleteMany({ where: { id: feedUserId } });
    await db.newsJobRun.deleteMany({ where: { trigger: "manual" } });
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    isFeedUrlAllowed.mockResolvedValue(true);

    await db.newsPublication.deleteMany({ where: { feedId } });
    await db.post.deleteMany({ where: { authorId: feedUserId } });
    await db.newsStory.deleteMany({
      where: { references: { some: { source: { key: { in: sourceKeys } } } } },
    });
    await db.newsSource.updateMany({
      where: { key: { in: sourceKeys } },
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
    await db.newsFeed.update({ where: { id: feedId }, data: { lastPublishedAt: null } });

    await db.newsAutomationSetting.upsert({
      where: { id: SETTINGS_ID },
      update: { paused: false, enabledLanguages: ["en"] },
      create: { id: SETTINGS_ID, paused: false, enabledLanguages: ["en"] },
    });
  });

  it("collapses one event reported by three outlets into a single post with three attributions", async () => {
    // Deliberately three different wordings of one event, which is what
    // actually arrives in production.
    const wordings = [
      "Storm closes Geneva airport",
      "Geneva airport closed after overnight storm",
      "Geneva airport shut as storm disrupts flights",
    ];

    safeFetch.mockImplementation(async (url: string) => {
      const index = Number(url.match(/outlet(\d)/)?.[1] ?? 0);
      return fetchResult(
        rssFor([
          {
            title: wordings[index],
            link: `https://outlet${index}.example/${suffix}/story`,
            summary: "Departures are suspended until midday.",
          },
        ])
      );
    });

    generateRenditions.mockImplementation(async (languages: string[]) =>
      languages.map((language) => ({
        language,
        rendition: {
          headline: "Geneva airport closed after overnight storm",
          body: "Departures are suspended.\n\nThe airport authority expects operations to resume at midday.",
          model: "test",
          validation: { ok: true, unsupportedNumbers: [], fabricatedQuotes: 0, injectedUrls: [], tooLong: false, tooShort: false },
        },
        error: null,
        validation: null,
      }))
    );

    const result = await runPipelineCycle({
      trigger: "manual",
      now: new Date("2026-02-03T12:00:00Z"),
      db,
      skipLock: true,
    });

    expect(result.ran).toBe(true);
    expect(result.sourcesFetched).toBe(3);
    expect(result.storiesCreated).toBe(1);
    // The other two reports merged rather than becoming their own posts.
    expect(result.duplicatesPrevented).toBeGreaterThanOrEqual(2);

    const stories = await db.newsStory.findMany({
      where: { references: { some: { source: { key: { in: sourceKeys } } } } },
      include: { references: { include: { source: true } } },
    });

    expect(stories).toHaveLength(1);
    expect(stories[0].references).toHaveLength(3);
    // Three independent tier-2 outlets agreeing is what CONFIRMED means.
    expect(stories[0].confidence).toBe("CONFIRMED");

    const posts = await db.post.findMany({ where: { authorId: feedUserId } });
    expect(posts).toHaveLength(1);
    for (const index of [0, 1, 2]) {
      expect(posts[0].content).toContain(`Outlet ${index}`);
    }
  });

  it("publishes nothing at all when the sources return nothing", async () => {
    safeFetch.mockResolvedValue(fetchResult(rssFor([])));

    const result = await runPipelineCycle({
      trigger: "manual",
      now: new Date("2026-02-03T12:00:00Z"),
      db,
      skipLock: true,
    });

    // The correct output for a quiet cycle is silence, not filler.
    expect(result.storiesCreated).toBe(0);
    expect(result.published).toBe(0);
    expect(generateRenditions).not.toHaveBeenCalled();
    expect(await db.post.count({ where: { authorId: feedUserId } })).toBe(0);
  });

  it("publishes nothing when every summary fails validation", async () => {
    safeFetch.mockImplementation(async (url: string) => {
      const index = Number(url.match(/outlet(\d)/)?.[1] ?? 0);
      return fetchResult(
        rssFor([
          {
            title: `Distinct story number ${index} about a local council decision`,
            link: `https://outlet${index}.example/${suffix}/story-${index}`,
            summary: "The council voted on the proposal.",
          },
        ])
      );
    });

    // A real groundedness rejection carries the validator's report; the
    // pipeline uses its presence to tell an editorial refusal from a
    // provider fault, so the fixture has to carry one too.
    generateRenditions.mockImplementation(async (languages: string[]) =>
      languages.map((language) => ({
        language,
        rendition: null,
        error: "Generated summary failed groundedness validation (unsupported figures: 480)",
        validation: {
          ok: false,
          unsupportedNumbers: ["480"],
          fabricatedQuotes: 0,
          injectedUrls: [],
          tooLong: false,
          tooShort: false,
        },
      }))
    );

    const result = await runPipelineCycle({
      trigger: "manual",
      now: new Date("2026-02-03T12:00:00Z"),
      db,
      skipLock: true,
    });

    expect(result.renditionsFailed).toBeGreaterThan(0);
    expect(result.published).toBe(0);
    expect(await db.post.count({ where: { authorId: feedUserId } })).toBe(0);

    const rejected = await db.newsStory.findMany({
      where: { references: { some: { source: { key: { in: sourceKeys } } } }, status: "REJECTED" },
    });
    expect(rejected.length).toBeGreaterThan(0);
    // Rejected for what actually happened, not a stock message.
    expect(rejected[0].rejectionReason).toContain("groundedness");
  });

  /*
   * A provider fault is not the story's fault. A production sample of
   * 187 rendition failures held 102 empty completions and unparseable
   * responses against 11 genuine groundedness rejections - and every
   * one of those 102 stories was thrown away permanently, so a provider
   * having a bad hour emptied the categories for the rest of the day.
   */
  it("keeps a story for another cycle when the model fails for a reason that is not the story's", async () => {
    safeFetch.mockImplementation(async (url: string) => {
      const index = Number(url.match(/outlet(\d)/)?.[1] ?? 0);
      return fetchResult(
        rssFor([
          {
            title: `Distinct story number ${index} about a regional transport plan`,
            link: `https://outlet${index}.example/${suffix}/transport-${index}`,
            summary: "The plan was presented to the assembly.",
          },
        ], new Date("2026-02-03T11:30:00Z"))
      );
    });

    // No validation report: an empty completion, not a refusal.
    generateRenditions.mockImplementation(async (languages: string[]) =>
      languages.map((language) => ({
        language,
        rendition: null,
        error: "Model returned an empty response",
        validation: null,
      }))
    );

    const result = await runPipelineCycle({
      trigger: "manual",
      now: new Date("2026-02-03T12:00:00Z"),
      db,
      skipLock: true,
    });

    expect(result.renditionsFailed).toBeGreaterThan(0);
    expect(result.renditionsRetryable).toBeGreaterThan(0);
    expect(result.published).toBe(0);

    const stories = await db.newsStory.findMany({
      where: { references: { some: { source: { key: { in: sourceKeys } } } } },
    });
    expect(stories.length).toBeGreaterThan(0);
    for (const story of stories) {
      // Still NEW, so the next cycle picks it up - not discarded.
      expect(story.status).toBe("NEW");
      expect(story.rejectionReason).toBeNull();
    }
  });

  it("gives up on a story the model never manages to summarise", async () => {
    safeFetch.mockImplementation(async (url: string) => {
      const index = Number(url.match(/outlet(\d)/)?.[1] ?? 0);
      return fetchResult(
        rssFor([
          {
            title: `Distinct story number ${index} about a museum funding round`,
            link: `https://outlet${index}.example/${suffix}/museum-${index}`,
            summary: "The funding was announced this morning.",
          },
        ], new Date("2026-02-03T11:30:00Z"))
      );
    });

    generateRenditions.mockImplementation(async (languages: string[]) =>
      languages.map((language) => ({
        language,
        rendition: null,
        error: "Model returned an empty response",
        validation: null,
      }))
    );

    // Ingest now...
    await runPipelineCycle({
      trigger: "manual",
      now: new Date("2026-02-03T12:00:00Z"),
      db,
      skipLock: true,
    });

    // ...and try again once the retry window has passed. Retrying
    // forever would burn model calls on a story that cannot be written.
    await runPipelineCycle({
      trigger: "manual",
      now: new Date("2026-02-03T19:00:00Z"),
      db,
      skipLock: true,
    });

    const stories = await db.newsStory.findMany({
      where: { references: { some: { source: { key: { in: sourceKeys } } } } },
    });
    expect(stories.length).toBeGreaterThan(0);
    for (const story of stories) {
      expect(story.status).toBe("REJECTED");
      // The reason says what really happened, so a provider problem is
      // not filed away as an editorial one.
      expect(story.rejectionReason).toContain("non-editorial");
    }
  });

  it("records a source failure with backoff instead of inventing content", async () => {
    safeFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await runPipelineCycle({
      trigger: "manual",
      now: new Date("2026-02-03T12:00:00Z"),
      db,
      skipLock: true,
    });

    expect(result.sourcesFailed).toBe(3);
    expect(result.published).toBe(0);

    const sources = await db.newsSource.findMany({ where: { key: { in: sourceKeys } } });
    for (const source of sources) {
      expect(source.status).toBe("WARNING");
      expect(source.consecutiveFailures).toBe(1);
      expect(source.backoffUntil).not.toBeNull();
      expect(source.lastError).toContain("ECONNREFUSED");
    }

    expect(await db.post.count({ where: { authorId: feedUserId } })).toBe(0);
  });

  it("refuses to poll a feed robots.txt disallows", async () => {
    isFeedUrlAllowed.mockResolvedValue(false);
    safeFetch.mockResolvedValue(fetchResult(rssFor([])));

    const result = await runPipelineCycle({
      trigger: "manual",
      now: new Date("2026-02-03T12:00:00Z"),
      db,
      skipLock: true,
    });

    expect(safeFetch).not.toHaveBeenCalled();
    expect(result.sourcesFailed).toBe(3);

    const source = await db.newsSource.findFirstOrThrow({ where: { key: sourceKeys[0] } });
    expect(source.lastError).toContain("robots.txt");
  });

  it("does nothing at all while the automation is paused", async () => {
    await db.newsAutomationSetting.update({ where: { id: SETTINGS_ID }, data: { paused: true } });
    safeFetch.mockResolvedValue(fetchResult(rssFor([])));

    const result = await runPipelineCycle({
      trigger: "manual",
      now: new Date("2026-02-03T12:00:00Z"),
      db,
      skipLock: true,
    });

    expect(result.ran).toBe(false);
    expect(result.reason).toContain("paused");
    expect(safeFetch).not.toHaveBeenCalled();
  });

  it("holds a sensitive story for human review rather than auto-publishing it", async () => {
    safeFetch.mockImplementation(async (url: string) => {
      const index = Number(url.match(/outlet(\d)/)?.[1] ?? 0);
      return fetchResult(
        rssFor([
          {
            title: "Several killed in explosion at a chemical plant",
            link: `https://outlet${index}.example/${suffix}/sensitive`,
            summary: "Emergency services are at the scene.",
          },
        ])
      );
    });

    generateRenditions.mockResolvedValue([]);

    const result = await runPipelineCycle({
      trigger: "manual",
      now: new Date("2026-02-03T12:00:00Z"),
      db,
      skipLock: true,
    });

    expect(result.storiesCreated).toBe(1);
    // Never handed to the model, never planned, never published.
    expect(generateRenditions).not.toHaveBeenCalled();
    expect(result.published).toBe(0);

    const story = await db.newsStory.findFirstOrThrow({
      where: { references: { some: { source: { key: { in: sourceKeys } } } } },
    });
    expect(story.sensitive).toBe(true);
    expect(story.status).toBe("NEW");
  });

  it("still reaches the other travel languages in a later cycle, after the first one published", async () => {
    // Regression: publishing a story in English flips NewsStory.status to
    // PUBLISHED. A planner that only ever looked at READY stories would
    // therefore strand the French, German and Italian versions of a
    // travel story whose other-language feeds happened to be in cooldown
    // during the first cycle - quietly breaking the four-language
    // guarantee.
    await db.newsAutomationSetting.update({
      where: { id: SETTINGS_ID },
      data: { paused: false, enabledLanguages: ["en", "fr"] },
    });

    safeFetch.mockImplementation(async (url: string) => {
      const index = Number(url.match(/outlet(\d)/)?.[1] ?? 0);
      return fetchResult(
        rssFor([
          {
            title: "Geneva airport closed after overnight storm",
            link: `https://outlet${index}.example/${suffix}/travel`,
            summary: "Departures are suspended until midday.",
          },
        ])
      );
    });

    generateRenditions.mockImplementation(async (languages: string[]) =>
      languages.map((language) => ({
        language,
        rendition: {
          headline:
            language === "fr"
              ? "L'aéroport de Genève fermé après une tempête nocturne"
              : "Geneva airport closed after overnight storm",
          body:
            language === "fr"
              ? "Les départs sont suspendus.\n\nL'exploitant prévoit une reprise à la mi-journée."
              : "Departures are suspended.\n\nThe airport authority expects operations to resume at midday.",
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
      }))
    );

    // Cycle 1: only the English desk exists, so only English can publish.
    await runPipelineCycle({
      trigger: "manual",
      now: new Date("2026-02-03T12:00:00Z"),
      db,
      skipLock: true,
    });

    const story = await db.newsStory.findFirstOrThrow({
      where: { references: { some: { source: { key: { in: sourceKeys } } } } },
    });
    expect(story.status).toBe("PUBLISHED");
    expect(
      await db.newsPublication.findMany({ where: { storyId: story.id } })
    ).toHaveLength(1);

    // A French desk comes online, and a later cycle runs.
    const frenchUser = await db.user.create({
      data: {
        email: `${feedKey}-fr@zrp-news.invalid`,
        username: `zrp_pfr_${suffix}`,
        name: "ZRP Travel Français Test",
        isEditorialFeed: true,
        badgeType: "editorial",
      },
      select: { id: true },
    });

    const frenchFeed = await db.newsFeed.create({
      data: {
        key: `${feedKey}-fr`,
        displayName: "ZRP Travel Français Test",
        userId: frenchUser.id,
        region: "GLOBAL",
        language: "fr",
        timezone: "UTC",
        enabled: true,
        minMinutesBetweenPosts: 30,
        maxPostsPerDay: 10,
      },
    });

    try {
      await runPipelineCycle({
        trigger: "manual",
        now: new Date("2026-02-03T13:00:00Z"),
        db,
        skipLock: true,
      });

      const publications = await db.newsPublication.findMany({
        where: { storyId: story.id },
      });

      expect(publications.map((row) => row.language).sort()).toEqual(["en", "fr"]);
      // Still exactly one publication per language - the guarantee that
      // makes this safe to do at all.
      expect(new Set(publications.map((row) => row.language)).size).toBe(2);
    } finally {
      await db.newsPublication.deleteMany({ where: { feedId: frenchFeed.id } });
      await db.post.deleteMany({ where: { authorId: frenchUser.id } });
      await db.newsFeed.deleteMany({ where: { id: frenchFeed.id } });
      await db.user.deleteMany({ where: { id: frenchUser.id } });
    }
  });

  it("writes a job run recording what the cycle actually did", async () => {
    safeFetch.mockResolvedValue(fetchResult(rssFor([])));

    const result = await runPipelineCycle({
      trigger: "manual",
      now: new Date("2026-02-03T12:00:00Z"),
      db,
      skipLock: true,
    });

    const jobRun = await db.newsJobRun.findUniqueOrThrow({ where: { id: result.jobRunId! } });
    expect(jobRun.status).toBe("SUCCEEDED");
    expect(jobRun.finishedAt).not.toBeNull();
    expect(jobRun.sourcesFetched).toBe(3);
  });
});
