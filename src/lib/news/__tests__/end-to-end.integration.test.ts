import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { randomUUID } from "crypto";

const { safeFetch, isFeedUrlAllowed, generateRenditions } = vi.hoisted(() => ({
  safeFetch: vi.fn(),
  isFeedUrlAllowed: vi.fn(),
  generateRenditions: vi.fn(),
}));

// The same three outside-world edges the other pipeline integration
// tests stub - the network, robots.txt and the language model. Nothing
// else is mocked: ingestion, dedupe, classification, ranking,
// scheduling, publication, the /news bridge, the API route and its
// category filter are all the real implementations against a real
// database.
vi.mock("@/lib/ssrf-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ssrf-guard")>();
  return { ...actual, safeFetch };
});
vi.mock("../robots", () => ({ isFeedUrlAllowed }));
vi.mock("../generate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../generate")>();
  return { ...actual, generateRenditions };
});

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { runPipelineCycle } from "../pipeline";
import { SETTINGS_ID } from "../settings";
import { GET as getNews } from "@/app/api/news/route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

const db = prisma;
const NOW = new Date("2026-02-03T12:00:00Z");

type ApiArticle = {
  id: string;
  title: string;
  slug: string;
  category: string;
  status: string;
  publishedAt: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  author: { id: string; username: string; badgeType: string | null };
};

/*
 * ============================================================
 * The whole chain, once, for real
 * ============================================================
 *
 * Every other test covers one link. This covers the claim the system
 * actually makes to a reader: an RSS item published by a real outlet
 * ends up on the right ZRP News category page, and nowhere else.
 *
 *   RSS item -> NewsSource fetch -> NewsStory -> NewsRendition ->
 *   NewsPublication -> Post + NewsArticle -> GET /api/news?category=...
 *
 * Two stories in two different categories run through it together, so
 * the test also proves the categories do not bleed into each other -
 * which is what "published in the wrong category" would look like.
 */
describe.skipIf(!hasRealDatabaseUrl)("ZRP News end to end (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const cryptoSourceKey = `e2e-src-crypto-${suffix}`;
  const sportsSourceKey = `e2e-src-sports-${suffix}`;
  const cryptoFeedKey = `e2e-feed-crypto-${suffix}`;
  const sportsFeedKey = `e2e-feed-sports-${suffix}`;

  const sourceKeys = [cryptoSourceKey, sportsSourceKey];
  const feedKeys = [cryptoFeedKey, sportsFeedKey];
  const userIds: string[] = [];

  const CRYPTO_STORY = {
    title: "Bitcoin ETF inflows reach a record for the quarter",
    link: `https://cryptowire.example/${suffix}/bitcoin-etf`,
    summary:
      "Spot bitcoin exchange traded funds took in more than any previous quarter, according to filings.",
  };

  const SPORTS_STORY = {
    title: "Switzerland beat Italy in the final qualifier",
    link: `https://sportswire.example/${suffix}/qualifier`,
    summary:
      "The match finished after a late goal, sending the team through to the tournament.",
  };

  function rssFor(item: { title: string; link: string; summary: string }): string {
    return `<?xml version="1.0"?><rss version="2.0"><channel><item><title>${item.title}</title><link>${item.link}</link><description>${item.summary}</description><pubDate>${NOW.toUTCString()}</pubDate></item></channel></rss>`;
  }

  async function newsApi(query: string) {
    const response = await getNews(new NextRequest(`http://localhost/api/news${query}`));
    const body = (await response.json()) as { success: boolean; articles?: ApiArticle[] };
    return {
      status: response.status,
      success: body.success,
      // Only what this test published; the table may hold real articles.
      articles: (body.articles ?? []).filter((a) => userIds.includes(a.author.id)),
    };
  }

  beforeAll(async () => {
    for (const [feedKey, topic, name] of [
      [cryptoFeedKey, "CRYPTO", "ZRP Crypto E2E"],
      [sportsFeedKey, "SPORTS", "ZRP Sports E2E"],
    ] as const) {
      const user = await db.user.create({
        data: {
          email: `${feedKey}@zrp-news.invalid`,
          username: `zrp_e2e_${topic.toLowerCase()}_${suffix}`,
          name,
          bio: "Official ZRP editorial feed · automated. Test fixture.",
          isEditorialFeed: true,
          badgeType: "editorial",
        },
        select: { id: true },
      });
      userIds.push(user.id);

      await db.newsFeed.create({
        data: {
          key: feedKey,
          displayName: name,
          userId: user.id,
          region: "GLOBAL",
          language: "en",
          timezone: "UTC",
          enabled: true,
          // The desk publishes its own topic and nothing else, which is
          // how the live category desks are configured.
          topics: [topic],
          minMinutesBetweenPosts: 60,
          maxPostsPerDay: 24,
        },
      });
    }

    for (const [key, topic, host] of [
      [cryptoSourceKey, "CRYPTO", "cryptowire"],
      [sportsSourceKey, "SPORTS", "sportswire"],
    ] as const) {
      await db.newsSource.create({
        data: {
          key,
          name: `${host} wire`,
          publisher: `${host} wire`,
          feedUrl: `https://${host}.example/${suffix}/feed.xml`,
          region: "GLOBAL",
          language: "en",
          topics: [topic],
          trustTier: 2,
          fetchIntervalMinutes: 15,
        },
      });
    }
  });

  afterAll(async () => {
    if (!hasRealDatabaseUrl) return;
    await db.newsArticle.deleteMany({ where: { authorId: { in: userIds } } });
    await db.newsPublication.deleteMany({ where: { feed: { key: { in: feedKeys } } } });
    await db.newsStory.deleteMany({
      where: { references: { some: { source: { key: { in: sourceKeys } } } } },
    });
    await db.newsSource.deleteMany({ where: { key: { in: sourceKeys } } });
    await db.newsFeed.deleteMany({ where: { key: { in: feedKeys } } });
    await db.post.deleteMany({ where: { authorId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    isFeedUrlAllowed.mockResolvedValue(true);

    await db.newsArticle.deleteMany({ where: { authorId: { in: userIds } } });
    await db.newsPublication.deleteMany({ where: { feed: { key: { in: feedKeys } } } });
    await db.post.deleteMany({ where: { authorId: { in: userIds } } });
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
    await db.newsFeed.updateMany({
      where: { key: { in: feedKeys } },
      data: { lastPublishedAt: null },
    });

    await db.newsAutomationSetting.upsert({
      where: { id: SETTINGS_ID },
      update: { paused: false, enabledLanguages: ["en"] },
      create: { id: SETTINGS_ID, paused: false, enabledLanguages: ["en"] },
    });

    safeFetch.mockImplementation(async (url: string) => {
      const item = url.includes("cryptowire") ? CRYPTO_STORY : SPORTS_STORY;
      return { statusCode: 200, headers: {}, body: Buffer.from(rssFor(item), "utf-8") };
    });

    generateRenditions.mockImplementation(
      async (languages: string[], context: { storyTitle: string }) => {
        // Echo the real story title, so what a reader ends up seeing can
        // be traced back to the wire item it came from.
        const headline = context.storyTitle;
        return languages.map((language) => ({
          language,
          rendition: {
            headline,
            body: "The wire report gives the detail.\n\nA second paragraph carries the rest of it.",
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
        }));
      }
    );
  });

  function cycleAt(at: Date) {
    return runPipelineCycle({ trigger: "manual", now: at, db, skipLock: true });
  }

  /*
   * Publications are deliberately spaced rather than fired all at once,
   * so the first story goes out immediately and the rest are scheduled
   * across the window. A later cycle publishes each one as it falls
   * due - which is why reaching every category takes the cycles the
   * hour actually contains, not a single burst.
   */
  async function runCycleAndDrain() {
    const first = await cycleAt(NOW);
    // The next hourly cycle picks up what the first one scheduled a few
    // minutes out. One hour, fixed: if reaching a category needed longer
    // than that, hourly coverage would not be possible.
    await cycleAt(new Date(NOW.getTime() + 60 * 60 * 1000));
    return first;
  }

  it("carries a wire item all the way to its own category page", async () => {
    const result = await runCycleAndDrain();

    // Ingestion actually happened, from the sources - not from nowhere.
    expect(result.ran).toBe(true);
    expect(result.sourcesFetched).toBe(2);
    expect(result.storiesCreated).toBe(2);
    // Both were scheduled by the first cycle; spacing decides which of
    // them goes out in it and which one a few minutes later.
    expect(result.scheduled).toBe(2);

    // The /news bridge wrote a real article per story.
    const stored = await db.newsArticle.findMany({
      where: { authorId: { in: userIds } },
      select: { title: true, category: true, status: true, publishedAt: true, sourceUrl: true },
    });
    expect(stored).toHaveLength(2);
    for (const row of stored) {
      expect(row.status).toBe("PUBLISHED");
      expect(row.publishedAt).not.toBeNull();
      // Attribution survives the whole chain, back to the real outlet.
      expect(row.sourceUrl).toMatch(/^https:\/\/(crypto|sports)wire\.example\//);
    }

    // And the public API - the only thing the category page reads -
    // serves each one under its own category and nothing else.
    const crypto = await newsApi("?category=CRYPTO&limit=50");
    expect(crypto.status).toBe(200);
    expect(crypto.articles).toHaveLength(1);
    expect(crypto.articles[0].title).toContain("Bitcoin");
    expect(crypto.articles[0].sourceUrl).toContain("cryptowire.example");

    const sports = await newsApi("?category=SPORTS&limit=50");
    expect(sports.articles).toHaveLength(1);
    expect(sports.articles[0].title).toContain("Switzerland");

    // The crypto story is not also sitting in Sports, and neither is in
    // a third category: this is what a mis-categorised article means.
    const cryptoIds = crypto.articles.map((a) => a.id);
    const sportsIds = sports.articles.map((a) => a.id);
    expect(cryptoIds.some((id) => sportsIds.includes(id))).toBe(false);

    const everything = await newsApi("?limit=50");
    expect(everything.articles).toHaveLength(2);
    expect(new Set(everything.articles.map((a) => a.category))).toEqual(
      new Set(["CRYPTO", "SPORTS"])
    );
  });

  it("shows the article under the editorial account that published it", async () => {
    await runCycleAndDrain();

    const { articles } = await newsApi("?category=CRYPTO&limit=50");
    expect(articles).toHaveLength(1);
    // The reader sees a ZRP desk with the editorial badge, not a person.
    expect(articles[0].author.username).toContain("zrp_e2e_crypto");
    expect(articles[0].author.badgeType).toBe("editorial");
  });

  it("does not publish the same wire item twice when the cycle runs again", async () => {
    await runCycleAndDrain();
    const afterFirst = await newsApi("?limit=50");
    expect(afterFirst.articles).toHaveLength(2);

    // An hour later the same items are still at the top of both wires,
    // which is exactly what happens in production.
    await cycleAt(new Date(NOW.getTime() + 2 * 60 * 60 * 1000));

    const afterSecond = await newsApi("?limit=50");
    expect(afterSecond.articles).toHaveLength(2);
    expect(new Set(afterSecond.articles.map((a) => a.id))).toEqual(
      new Set(afterFirst.articles.map((a) => a.id))
    );
  });

  it("leaves a category genuinely empty rather than filling it with another category's story", async () => {
    await runCycleAndDrain();

    // Nothing in the two wires is about politics, so Politics stays
    // empty. An empty category is the honest outcome; a story from the
    // crypto wire appearing here would not be.
    const politics = await newsApi("?category=POLITICS&limit=50");
    expect(politics.status).toBe(200);
    expect(politics.articles).toHaveLength(0);
  });
});
