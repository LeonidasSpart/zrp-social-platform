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
vi.mock("../generate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../generate")>();
  return { ...actual, generateRenditions };
});

import { prisma } from "@/lib/db";
import { runPipelineCycle } from "../pipeline";
import { SETTINGS_ID } from "../settings";
import { getRedisClient } from "@/lib/redis";
import { NextRequest } from "next/server";
import { GET as cronRoute } from "@/app/api/cron/news-pipeline/route";

/*
 * Duplicate-publication safety under the conditions that actually cause
 * duplicates in production: the cron firing while a manual run is still
 * going, a retried cycle, and the same event arriving from several
 * sources with different wording and different URLs.
 *
 * These run against a REAL Postgres and a REAL Redis, and deliberately
 * do NOT pass skipLock - the distributed lock is part of what is being
 * tested.
 */
const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");
const hasRedis = !!(process.env.REDIS_URL || process.env.REDIS_PUBLIC_URL);

const db = prisma;
const CYCLE_AT = new Date("2026-02-03T12:00:00Z");

function rssFor(
  items: Array<{ title: string; link: string; summary: string }>,
  publishedAt: Date = CYCLE_AT
): string {
  return `<?xml version="1.0"?><rss version="2.0"><channel>${items
    .map(
      (item) =>
        `<item><title>${item.title}</title><link>${item.link}</link><description>${item.summary}</description><pubDate>${publishedAt.toUTCString()}</pubDate></item>`
    )
    .join("")}</channel></rss>`;
}

const fetchResult = (body: string) => ({
  statusCode: 200,
  headers: {},
  body: Buffer.from(body, "utf-8"),
});

const OK_RENDITION = (language: string) => ({
  language,
  rendition: {
    headline: "Example Test Airport suspends departures after overnight storm",
    body: "Departures are suspended.\n\nThe airport expects operations to resume at midday.",
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
});

describe.skipIf(!hasRealDatabaseUrl || !hasRedis)(
  "duplicate safety under repeated and concurrent execution",
  () => {
    const suffix = randomUUID().slice(0, 8);
    const sourceKeys = [`cc-a-${suffix}`, `cc-b-${suffix}`, `cc-c-${suffix}`];
    const feedKey = `cc-feed-${suffix}`;

    let feedId: string;
    let userId: string;

    beforeAll(async () => {
      const user = await db.user.create({
        data: {
          email: `${feedKey}@zrp-news.invalid`,
          username: `zrp_cc_${suffix}`,
          name: "ZRP News Concurrency Test",
          isEditorialFeed: true,
          badgeType: "editorial",
        },
        select: { id: true },
      });
      userId = user.id;

      const feed = await db.newsFeed.create({
        data: {
          key: feedKey,
          displayName: "ZRP News Concurrency Test",
          userId,
          region: "GLOBAL",
          language: "en",
          timezone: "UTC",
          enabled: true,
          minMinutesBetweenPosts: 30,
          maxPostsPerDay: 20,
        },
      });
      feedId = feed.id;

      for (const [index, key] of sourceKeys.map((k, i) => [i, k] as const)) {
        void index;
        await db.newsSource.create({
          data: {
            key,
            name: `Outlet ${key}`,
            publisher: `Outlet ${key}`,
            feedUrl: `https://outlet-${key}.example/feed.xml`,
            region: "GLOBAL",
            language: "en",
            trustTier: 2,
            fetchIntervalMinutes: 15,
          },
        });
      }
    });

    afterAll(async () => {
      if (!hasRealDatabaseUrl || !hasRedis) return;
      await db.newsPublication.deleteMany({ where: { feedId } });
      await db.newsStory.deleteMany({
        where: { references: { some: { source: { key: { in: sourceKeys } } } } },
      });
      await db.newsSource.deleteMany({ where: { key: { in: sourceKeys } } });
      await db.newsFeed.deleteMany({ where: { id: feedId } });
      await db.post.deleteMany({ where: { authorId: userId } });
      await db.user.deleteMany({ where: { id: userId } });

      const redis = await getRedisClient();
      await redis?.del("news:pipeline:lock");
    });

    beforeEach(async () => {
      vi.clearAllMocks();
      isFeedUrlAllowed.mockResolvedValue(true);
      generateRenditions.mockImplementation(async (languages: string[]) =>
        languages.map(OK_RENDITION)
      );

      await db.newsPublication.deleteMany({ where: { feedId } });
      await db.post.deleteMany({ where: { authorId: userId } });
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

      const redis = await getRedisClient();
      await redis?.del("news:pipeline:lock");

      // Three outlets, three different URLs, three different wordings of
      // one event - the real shape of breaking coverage.
      safeFetch.mockImplementation(async (url: string) => {
        const wordings = [
          "Example Test Airport suspends departures after overnight storm",
          "Storm suspends departures at Example Test Airport",
          "Departures suspended at Example Test Airport following overnight storm",
        ];
        const index = sourceKeys.findIndex((key) => url.includes(key));
        const safeIndex = index === -1 ? 0 : index;
        return fetchResult(
          rssFor([
            {
              title: wordings[safeIndex],
              link: `https://outlet-${sourceKeys[safeIndex]}.example/story-${safeIndex}`,
              summary: "Departures are suspended until midday.",
            },
          ])
        );
      });
    });

    async function postCount() {
      return db.post.count({ where: { authorId: userId } });
    }

    it("produces one post from three outlets reporting one event", async () => {
      await runPipelineCycle({ trigger: "manual", now: CYCLE_AT, db });

      const stories = await db.newsStory.findMany({
        where: { references: { some: { source: { key: { in: sourceKeys } } } } },
        include: { references: true },
      });

      expect(stories).toHaveLength(1);
      expect(stories[0].references).toHaveLength(3);
      // Three distinct source URLs, all attributed, one post.
      expect(new Set(stories[0].references.map((r) => r.url)).size).toBe(3);
      expect(await postCount()).toBe(1);
    });

    it("is safe to run the cycle repeatedly", async () => {
      for (let index = 0; index < 4; index += 1) {
        await runPipelineCycle({
          trigger: "manual",
          now: new Date(CYCLE_AT.getTime() + index * 30 * 60 * 1000),
          db,
        });
      }

      expect(await postCount()).toBe(1);
      expect(
        await db.newsPublication.count({ where: { feedId, status: "PUBLISHED" } })
      ).toBe(1);
    }, 30000);

    it("lets only one of two concurrent cycles run, via the real Redis lock", async () => {
      const [first, second] = await Promise.all([
        runPipelineCycle({ trigger: "cron", now: CYCLE_AT, db }),
        runPipelineCycle({ trigger: "manual", now: CYCLE_AT, db }),
      ]);

      const ran = [first, second].filter((result) => result.ran);
      const blocked = [first, second].filter((result) => !result.ran);

      expect(ran).toHaveLength(1);
      expect(blocked).toHaveLength(1);
      expect(blocked[0].reason).toContain("lock");

      expect(await postCount()).toBe(1);
    }, 30000);

    it("does not double-publish when the same feed item is re-ingested", async () => {
      await runPipelineCycle({ trigger: "manual", now: CYCLE_AT, db });
      const afterFirst = await postCount();

      // Same URLs served again on the next poll, exactly as a real feed
      // does - the item is still on the front page.
      await db.newsSource.updateMany({
        where: { key: { in: sourceKeys } },
        data: { lastFetchedAt: null, etag: null, lastModified: null },
      });

      await runPipelineCycle({
        trigger: "manual",
        now: new Date(CYCLE_AT.getTime() + 60 * 60 * 1000),
        db,
      });

      const references = await db.newsStorySource.findMany({
        where: { source: { key: { in: sourceKeys } } },
      });

      // The unique constraint on url means re-ingest is a no-op.
      expect(references).toHaveLength(3);
      expect(await postCount()).toBe(afterFirst);
    }, 30000);

    it("keeps the publication idempotency key stable across cycles", async () => {
      await runPipelineCycle({ trigger: "manual", now: CYCLE_AT, db });

      const publications = await db.newsPublication.findMany({ where: { feedId } });
      expect(publications).toHaveLength(1);

      const story = await db.newsStory.findFirstOrThrow({
        where: { references: { some: { source: { key: { in: sourceKeys } } } } },
      });

      expect(publications[0].idempotencyKey).toBe(`${story.id}:en`);

      // Attempting the identical reservation again must lose.
      await expect(
        db.newsPublication.create({
          data: {
            idempotencyKey: `${story.id}:en`,
            storyId: story.id,
            renditionId: publications[0].renditionId,
            feedId,
            language: "en",
            scheduledFor: CYCLE_AT,
          },
        })
      ).rejects.toThrow();

      expect(await postCount()).toBe(1);
    }, 30000);

    it("releases the lock after a cycle so the next one can run", async () => {
      await runPipelineCycle({ trigger: "manual", now: CYCLE_AT, db });

      const redis = await getRedisClient();
      expect(await redis?.exists("news:pipeline:lock")).toBe(0);
    }, 30000);

    it("drives the real cron route end to end, and twice is still one post", async () => {
      // The production route handler, the production pipeline, real
      // Postgres, real Redis. Only the publisher and the model are stood
      // in for.
      const originalSecret = process.env.CRON_SECRET;
      process.env.CRON_SECRET = `test-secret-${suffix}`;

      // The route uses the real clock, so these items must be genuinely
      // fresh - a fixture dated in the past is correctly discarded by the
      // freshness rule before it can ever be published.
      safeFetch.mockImplementation(async (url: string) => {
        const wordings = [
          "Example Test Airport suspends departures after overnight storm",
          "Storm suspends departures at Example Test Airport",
          "Departures suspended at Example Test Airport following overnight storm",
        ];
        const index = sourceKeys.findIndex((key) => url.includes(key));
        const safeIndex = index === -1 ? 0 : index;
        return fetchResult(
          rssFor(
            [
              {
                title: wordings[safeIndex],
                link: `https://outlet-${sourceKeys[safeIndex]}.example/story-${safeIndex}`,
                summary: "Departures are suspended until midday.",
              },
            ],
            new Date()
          )
        );
      });

      const call = (authorization?: string) => {
        const headers = new Headers();
        if (authorization !== undefined) headers.set("authorization", authorization);
        return cronRoute(
          new NextRequest("https://zrp.one/api/cron/news-pipeline", { headers })
        );
      };

      try {
        // Unauthorized attempts must not run anything at all.
        expect((await call()).status).toBe(401);
        expect((await call("Bearer wrong")).status).toBe(401);
        expect(await postCount()).toBe(0);

        const first = await call(`Bearer ${process.env.CRON_SECRET}`);
        expect(first.status).toBe(200);
        expect(await postCount()).toBe(1);

        // The scheduler firing again on the same content.
        await db.newsSource.updateMany({
          where: { key: { in: sourceKeys } },
          data: { lastFetchedAt: null, etag: null, lastModified: null },
        });

        const second = await call(`Bearer ${process.env.CRON_SECRET}`);
        expect(second.status).toBe(200);

        // Still one public post.
        expect(await postCount()).toBe(1);
      } finally {
        if (originalSecret === undefined) delete process.env.CRON_SECRET;
        else process.env.CRON_SECRET = originalSecret;
      }
    }, 60000);

    it("publishes nothing through the cron route while the automation is paused", async () => {
      const originalSecret = process.env.CRON_SECRET;
      process.env.CRON_SECRET = `test-secret-${suffix}`;

      await db.newsAutomationSetting.update({
        where: { id: SETTINGS_ID },
        data: { paused: true },
      });

      try {
        const headers = new Headers();
        headers.set("authorization", `Bearer ${process.env.CRON_SECRET}`);
        const response = await cronRoute(
          new NextRequest("https://zrp.one/api/cron/news-pipeline", { headers })
        );

        expect(response.status).toBe(200);
        const payload = await response.json();
        expect(payload.ran).toBe(false);
        expect(String(payload.reason)).toContain("paused");
        expect(await postCount()).toBe(0);
      } finally {
        if (originalSecret === undefined) delete process.env.CRON_SECRET;
        else process.env.CRON_SECRET = originalSecret;
      }
    }, 30000);

    it("refuses to run at all when Redis is unavailable, rather than running unlocked", async () => {
      // Fail-closed is the deliberate choice here: an unlocked cycle can
      // double-publish to a public feed, whereas a skipped cycle costs
      // nothing - the next one picks up the same stories.
      const originalUrl = process.env.REDIS_URL;
      const originalPublicUrl = process.env.REDIS_PUBLIC_URL;
      delete process.env.REDIS_URL;
      delete process.env.REDIS_PUBLIC_URL;

      try {
        const result = await runPipelineCycle({ trigger: "cron", now: CYCLE_AT, db });

        expect(result.ran).toBe(false);
        expect(result.reason).toContain("lock");
        expect(await postCount()).toBe(0);

        // Nothing was even fetched: the lock is taken before any work.
        expect(safeFetch).not.toHaveBeenCalled();
      } finally {
        if (originalUrl !== undefined) process.env.REDIS_URL = originalUrl;
        if (originalPublicUrl !== undefined) process.env.REDIS_PUBLIC_URL = originalPublicUrl;
      }
    }, 30000);

    it("normalizes differently-worded headlines onto one story identity", async () => {
      await runPipelineCycle({ trigger: "manual", now: CYCLE_AT, db });

      const stories = await db.newsStory.findMany({
        where: { references: { some: { source: { key: { in: sourceKeys } } } } },
      });

      expect(stories).toHaveLength(1);
      // sourceCount is what the confidence and ranking logic reads.
      expect(stories[0].sourceCount).toBe(3);
      expect(stories[0].confidence).toBe("CONFIRMED");
    }, 30000);
  }
);
