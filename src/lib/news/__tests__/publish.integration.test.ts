import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import {
  applyCorrection,
  findDuePublications,
  publishDuePublication,
  removePublication,
  reservePublication,
} from "../publish";
import { provisionFeeds, EDITORIAL_BADGE_TYPE } from "../feeds";
import { idempotencyKeyFor } from "../scheduler";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

const db = prisma;
const NOW = new Date("2026-02-03T12:00:00Z");

/*
 * Integration coverage for the parts of the pipeline whose whole job is
 * enforced by the database: the idempotency key that makes double
 * posting impossible, the transaction that links a publication to a
 * real Post, takedown, and visible corrections.
 *
 * Everything is namespaced with a run-specific suffix and torn down
 * afterwards - no fixture is left behind, and nothing here touches data
 * it did not create.
 */
describe.skipIf(!hasRealDatabaseUrl)("news publication (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const feedKey = `test-feed-${suffix}`;

  let feedId: string;
  let feedUserId: string;
  let sourceId: string;

  beforeAll(async () => {
    const result = await provisionFeeds(db, [
      {
        key: feedKey,
        username: `zrp_test_${suffix}`,
        displayName: "ZRP News Test Desk",
        description: "Official ZRP editorial feed · automated. Test fixture.",
        region: "EUROPE",
        country: "CH",
        language: "en",
        timezone: "Europe/Zurich",
        topics: [],
        isPilot: false,
        minMinutesBetweenPosts: 180,
        maxPostsPerDay: 6,
      },
    ]);

    expect(result.created).toEqual([feedKey]);

    const feed = await db.newsFeed.findUniqueOrThrow({ where: { key: feedKey } });
    feedId = feed.id;
    feedUserId = feed.userId;

    // Feeds are provisioned disabled; enable this one deliberately, the
    // same way an admin would.
    await db.newsFeed.update({ where: { id: feedId }, data: { enabled: true } });

    const source = await db.newsSource.create({
      data: {
        key: `test-source-${suffix}`,
        name: "Test Authority",
        publisher: "Test Authority",
        feedUrl: `https://authority.example/${suffix}/feed.xml`,
        region: "EUROPE",
        country: "CH",
        language: "en",
        trustTier: 1,
        official: true,
      },
    });
    sourceId = source.id;
  });

  afterAll(async () => {
    if (!hasRealDatabaseUrl) return;
    await db.newsPublication.deleteMany({ where: { feedId } });
    await db.newsStory.deleteMany({ where: { references: { some: { sourceId } } } });
    await db.newsSource.deleteMany({ where: { id: sourceId } });
    await db.newsFeed.deleteMany({ where: { id: feedId } });
    await db.post.deleteMany({ where: { authorId: feedUserId } });
    await db.newsArticle.deleteMany({ where: { authorId: feedUserId } });
    await db.user.deleteMany({ where: { id: feedUserId } });
  });

  let storyId: string;
  let renditionId: string;

  beforeEach(async () => {
    await db.newsPublication.deleteMany({ where: { feedId } });
    await db.post.deleteMany({ where: { authorId: feedUserId } });
    await db.newsArticle.deleteMany({ where: { authorId: feedUserId } });
    await db.newsStory.deleteMany({ where: { references: { some: { sourceId } } } });

    const story = await db.newsStory.create({
      data: {
        fingerprint: randomUUID(),
        normalizedTitle: "airport closed geneva storm",
        title: "Geneva airport closed after overnight storm",
        sourceMaterial: "[Test Authority] Geneva airport closed after overnight storm",
        topic: "AVIATION",
        region: "EUROPE",
        country: "CH",
        language: "en",
        confidence: "CONFIRMED",
        importance: 7,
        sourceCount: 1,
        status: "READY",
        firstSeenAt: NOW,
        lastSeenAt: NOW,
        references: {
          create: {
            sourceId,
            url: `https://authority.example/${randomUUID()}`,
            title: "Geneva airport closed after overnight storm",
            excerpt: "Departures are suspended until midday.",
            publishedAt: NOW,
          },
        },
        renditions: {
          create: {
            language: "en",
            headline: "Geneva airport closed after overnight storm",
            body: "Departures are suspended.\n\nThe airport authority expects operations to resume at midday.",
            status: "READY",
          },
        },
      },
      include: { renditions: true },
    });

    storyId = story.id;
    renditionId = story.renditions[0].id;
  });

  function slot() {
    return {
      storyId,
      renditionId,
      feedId,
      language: "en",
      scheduledFor: NOW,
      isBreaking: false,
    };
  }

  it("reserves a publication once and refuses the second attempt", async () => {
    const first = await reservePublication(db, slot());
    expect(first).not.toBeNull();

    // A retried cycle, an overlapping run, or a planner bug all arrive
    // here - and all lose to the unique constraint.
    const second = await reservePublication(db, slot());
    expect(second).toBeNull();

    const rows = await db.newsPublication.findMany({ where: { storyId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].idempotencyKey).toBe(idempotencyKeyFor(storyId, "en"));
  });

  it("publishes a real Post carrying the summary, the attribution and the source link", async () => {
    const reserved = await reservePublication(db, slot());
    const outcome = await publishDuePublication(db, reserved!.id, NOW);

    expect(outcome.status).toBe("published");
    expect(outcome.postId).toBeTruthy();

    const post = await db.post.findUniqueOrThrow({ where: { id: outcome.postId! } });
    const reference = await db.newsStorySource.findFirstOrThrow({ where: { storyId } });

    expect(post.authorId).toBe(feedUserId);
    expect(post.status).toBe("published");
    expect(post.content).toContain("TRAVEL UPDATE");
    expect(post.content).toContain("Test Authority");
    expect(post.content).toContain(reference.url);
    // The link goes in linkUrl too, so the existing link-preview and
    // post rendering treat it like any other post's link.
    expect(post.linkUrl).toBe(reference.url);
    // No image was cleared for reuse on this source, so none is used.
    expect(post.imageUrl).toBeNull();

    const publication = await db.newsPublication.findUniqueOrThrow({ where: { id: reserved!.id } });
    expect(publication.status).toBe("PUBLISHED");
    expect(publication.postId).toBe(post.id);

    const story = await db.newsStory.findUniqueOrThrow({ where: { id: storyId } });
    expect(story.status).toBe("PUBLISHED");

    const feed = await db.newsFeed.findUniqueOrThrow({ where: { id: feedId } });
    expect(feed.lastPublishedAt).not.toBeNull();
  });

  it("does not publish twice if the same publication is processed again", async () => {
    const reserved = await reservePublication(db, slot());
    await publishDuePublication(db, reserved!.id, NOW);
    const second = await publishDuePublication(db, reserved!.id, NOW);

    expect(second.status).toBe("skipped");
    expect(await db.post.count({ where: { authorId: feedUserId } })).toBe(1);
  });

  it("refuses to publish through a disabled feed", async () => {
    await db.newsFeed.update({ where: { id: feedId }, data: { enabled: false } });
    const reserved = await reservePublication(db, slot());
    const outcome = await publishDuePublication(db, reserved!.id, NOW);

    expect(outcome.status).toBe("failed");
    expect(outcome.reason).toContain("disabled");
    expect(await db.post.count({ where: { authorId: feedUserId } })).toBe(0);

    await db.newsFeed.update({ where: { id: feedId }, data: { enabled: true } });
  });

  it("refuses to publish through an account moderation has banned", async () => {
    // Editorial accounts get no exemption from moderation.
    await db.user.update({ where: { id: feedUserId }, data: { banned: true } });
    const reserved = await reservePublication(db, slot());
    const outcome = await publishDuePublication(db, reserved!.id, NOW);

    expect(outcome.status).toBe("failed");
    expect(outcome.reason).toContain("banned");
    expect(await db.post.count({ where: { authorId: feedUserId } })).toBe(0);

    await db.user.update({ where: { id: feedUserId }, data: { banned: false } });
  });

  it("refuses to publish a rendition that failed validation", async () => {
    await db.newsRendition.update({
      where: { id: renditionId },
      data: { status: "FAILED", error: "unsupported figures: 480" },
    });

    const reserved = await reservePublication(db, slot());
    const outcome = await publishDuePublication(db, reserved!.id, NOW);

    expect(outcome.status).toBe("failed");
    expect(await db.post.count({ where: { authorId: feedUserId } })).toBe(0);
  });

  it("only returns publications whose scheduled time has arrived", async () => {
    await reservePublication(db, { ...slot(), scheduledFor: new Date(NOW.getTime() + 3600_000) });

    expect(await findDuePublications(db, NOW, 10)).toHaveLength(0);
    expect(await findDuePublications(db, new Date(NOW.getTime() + 7200_000), 10)).toHaveLength(1);
  });

  it("takes a post down and records why, without re-creating it later", async () => {
    const reserved = await reservePublication(db, slot());
    const outcome = await publishDuePublication(db, reserved!.id, NOW);

    await removePublication(db, reserved!.id, "Source retracted the story", NOW);

    expect(await db.post.findUnique({ where: { id: outcome.postId! } })).toBeNull();

    const publication = await db.newsPublication.findUniqueOrThrow({ where: { id: reserved!.id } });
    expect(publication.status).toBe("REMOVED");
    expect(publication.removedReason).toBe("Source retracted the story");
    expect(publication.postId).toBeNull();

    // The idempotency key survives removal, so the next cycle cannot
    // quietly put the same story back out.
    expect(await reservePublication(db, slot())).toBeNull();
  });

  it("publishes a correction onto the live post instead of rewriting history", async () => {
    const reserved = await reservePublication(db, slot());
    const outcome = await publishDuePublication(db, reserved!.id, NOW);

    const before = await db.post.findUniqueOrThrow({ where: { id: outcome.postId! } });

    const updated = await applyCorrection(db, storyId, "Only departures are affected.", NOW);
    expect(updated).toBe(1);

    const after = await db.post.findUniqueOrThrow({ where: { id: outcome.postId! } });
    expect(after.content).toContain("CORRECTION: Only departures are affected.");
    // The original summary is still there - the correction is added, not
    // swapped in.
    expect(after.content).toContain("Departures are suspended.");
    expect(after.content).not.toBe(before.content);

    const story = await db.newsStory.findUniqueOrThrow({ where: { id: storyId } });
    expect(story.correctionNote).toBe("Only departures are affected.");
    expect(story.correctedAt).not.toBeNull();
  });

  it("also creates the /news-facing NewsArticle for a published story", async () => {
    const reserved = await reservePublication(db, slot());
    await publishDuePublication(db, reserved!.id, NOW);

    const reference = await db.newsStorySource.findFirstOrThrow({ where: { storyId } });
    const article = await db.newsArticle.findFirstOrThrow({ where: { sourceUrl: reference.url } });

    expect(article.title).toBe("Geneva airport closed after overnight storm");
    expect(article.content).toContain("Departures are suspended.");
    expect(article.status).toBe("PUBLISHED");
    expect(article.authorId).toBe(feedUserId);
    // country: "CH" takes priority over topic in the category mapping.
    expect(article.category).toBe("SWITZERLAND");
    expect(article.publishedAt).not.toBeNull();
  });

  it("does not create a second NewsArticle when the same story publishes again in another language", async () => {
    await db.newsRendition.create({
      data: {
        storyId,
        language: "fr",
        headline: "Aéroport de Genève fermé après une tempête nocturne",
        body: "Les départs sont suspendus.",
        status: "READY",
      },
    });

    await publishDuePublication(db, (await reservePublication(db, slot()))!.id, NOW);
    await publishDuePublication(
      db,
      (await reservePublication(db, { ...slot(), language: "fr" }))!.id,
      NOW
    );

    const reference = await db.newsStorySource.findFirstOrThrow({ where: { storyId } });
    const articles = await db.newsArticle.findMany({ where: { sourceUrl: reference.url } });
    expect(articles).toHaveLength(1);
    // The first publication to land wins - never silently overwritten by
    // a later language's rendition.
    expect(articles[0].title).toBe("Geneva airport closed after overnight storm");
  });

  it("removes the NewsArticle on takedown, mirroring the post's own removal", async () => {
    const reserved = await reservePublication(db, slot());
    await publishDuePublication(db, reserved!.id, NOW);

    const reference = await db.newsStorySource.findFirstOrThrow({ where: { storyId } });
    expect(await db.newsArticle.findFirst({ where: { sourceUrl: reference.url } })).not.toBeNull();

    await removePublication(db, reserved!.id, "Source retracted the story", NOW);

    expect(await db.newsArticle.findFirst({ where: { sourceUrl: reference.url } })).toBeNull();
  });

  it("mirrors a correction onto the NewsArticle, replacing rather than stacking on a second correction", async () => {
    const reserved = await reservePublication(db, slot());
    await publishDuePublication(db, reserved!.id, NOW);

    await applyCorrection(db, storyId, "Only departures are affected.", NOW);

    const reference = await db.newsStorySource.findFirstOrThrow({ where: { storyId } });
    const once = await db.newsArticle.findFirstOrThrow({ where: { sourceUrl: reference.url } });
    expect(once.content).toContain("Departures are suspended.");
    expect(once.content).toContain("CORRECTION: Only departures are affected.");

    await applyCorrection(db, storyId, "Correction: all flights are affected.", NOW);

    const twice = await db.newsArticle.findFirstOrThrow({ where: { sourceUrl: reference.url } });
    expect(twice.content).toContain("CORRECTION: Correction: all flights are affected.");
    expect(twice.content).not.toContain("Only departures are affected.");
    // Still exactly one correction marker, not two stacked.
    expect(twice.content.split("CORRECTION: ")).toHaveLength(2);
  });
});

describe.skipIf(!hasRealDatabaseUrl)("feed provisioning (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const key = `test-provision-${suffix}`;
  const username = `zrp_prov_${suffix}`;

  const definition = {
    key,
    username,
    displayName: "ZRP News Provision Test",
    description: "Official ZRP editorial feed · automated. Test fixture.",
    region: "GLOBAL" as const,
    country: null,
    language: "en",
    timezone: "UTC",
    topics: [],
    isPilot: false,
    minMinutesBetweenPosts: 180,
    maxPostsPerDay: 6,
  };

  afterAll(async () => {
    if (!hasRealDatabaseUrl) return;
    const feed = await db.newsFeed.findUnique({ where: { key } });
    if (feed) {
      await db.newsFeed.delete({ where: { key } });
      await db.user.deleteMany({ where: { id: feed.userId } });
    }
    await db.user.deleteMany({ where: { username } });
    await db.user.deleteMany({ where: { username: `human_${suffix}` } });
  });

  it("creates a disabled, unsignable, clearly-labelled editorial account", async () => {
    const result = await provisionFeeds(db, [definition]);
    expect(result.created).toEqual([key]);

    const feed = await db.newsFeed.findUniqueOrThrow({
      where: { key },
      include: { user: true },
    });

    expect(feed.enabled).toBe(false);
    expect(feed.user.isEditorialFeed).toBe(true);
    expect(feed.user.badgeType).toBe(EDITORIAL_BADGE_TYPE);
    // No password means the credentials flow can never authenticate it.
    expect(feed.user.password).toBeNull();
    expect(feed.user.email.endsWith(".invalid")).toBe(true);
    expect(feed.user.bio).toContain("automated");
  });

  it("is idempotent, and never re-enables a feed an admin turned off", async () => {
    await db.newsFeed.update({ where: { key }, data: { enabled: true } });

    const result = await provisionFeeds(db, [definition]);
    expect(result.updated).toEqual([key]);
    expect(result.created).toEqual([]);

    const feed = await db.newsFeed.findUniqueOrThrow({ where: { key } });
    expect(feed.enabled).toBe(true);

    await db.newsFeed.update({ where: { key }, data: { enabled: false } });
  });

  it("never takes a username a real person already holds", async () => {
    const humanUsername = `human_${suffix}`;
    await db.user.create({
      data: {
        email: `${humanUsername}@example.test`,
        username: humanUsername,
        name: "A Real Person",
      },
    });

    const result = await provisionFeeds(db, [
      { ...definition, key: `${key}-clash`, username: humanUsername },
    ]);

    expect(result.created).toEqual([]);
    expect(result.skipped[0].reason).toContain("already held by a non-editorial account");

    const human = await db.user.findUniqueOrThrow({ where: { username: humanUsername } });
    expect(human.isEditorialFeed).toBe(false);
    expect(human.name).toBe("A Real Person");
  });
});
