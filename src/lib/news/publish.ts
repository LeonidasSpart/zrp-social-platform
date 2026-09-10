import type { PrismaClient } from "@prisma/client";
import { composePostContent, isPostLengthValid, MAX_POST_LENGTH } from "./format";
import { fetchFallbackImage } from "./image-fallback";
import { correctNewsArticle, maybeCreateNewsArticle, removeNewsArticle } from "./news-article-bridge";
import { idempotencyKeyFor, type PlannedSlot } from "./scheduler";

/*
 * ============================================================
 * Publication
 * ============================================================
 *
 * Turns a planned slot into a real ZRP Post authored by an editorial
 * feed account.
 *
 * The post is an ordinary Post row. That is the whole point: it can be
 * liked, commented on, reposted, bookmarked, reported, muted and
 * moderated by exactly the same systems as any other post, and it is
 * subject to exactly the same policies. Nothing here bypasses
 * moderation, and nothing here touches likes, follows or views - the
 * automation publishes and stops.
 */

export interface PublishResult {
  publicationId: string;
  postId: string | null;
  status: "published" | "skipped" | "failed";
  reason: string | null;
}

/**
 * Reserves a publication row for a planned slot.
 *
 * Returns null when the slot is already reserved - the unique
 * constraint on idempotencyKey means a retried or concurrent cycle
 * loses this race rather than double-posting.
 */
export async function reservePublication(
  db: PrismaClient,
  slot: PlannedSlot
): Promise<{ id: string } | null> {
  const idempotencyKey = idempotencyKeyFor(slot.storyId, slot.language);

  try {
    const publication = await db.newsPublication.create({
      data: {
        idempotencyKey,
        storyId: slot.storyId,
        renditionId: slot.renditionId,
        feedId: slot.feedId,
        language: slot.language,
        scheduledFor: slot.scheduledFor,
        status: "SCHEDULED",
      },
      select: { id: true },
    });
    return publication;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Unique constraint")) return null;
    throw error;
  }
}

// A publication that has failed this many times is left alone: at that
// point the failure is systematic (bad data, a schema problem) and
// retrying it every cycle forever just buries the real errors.
export const MAX_PUBLISH_ATTEMPTS = 3;

/**
 * Publishes one due publication.
 *
 * Every failure path leaves the publication FAILED with a reason and
 * creates no post at all. Publishing a partial or malformed post is
 * never an option.
 */
export async function publishDuePublication(
  db: PrismaClient,
  publicationId: string,
  now: Date,
  options: { imageFallback?: Parameters<typeof fetchFallbackImage>[1] } = {}
): Promise<PublishResult> {
  const publication = await db.newsPublication.findUnique({
    where: { id: publicationId },
    include: {
      story: { include: { references: { include: { source: true } } } },
      rendition: true,
      feed: { include: { user: { select: { id: true, banned: true } } } },
    },
  });

  if (!publication) {
    return { publicationId, postId: null, status: "skipped", reason: "Publication not found" };
  }

  if (publication.status !== "SCHEDULED") {
    return {
      publicationId,
      postId: null,
      status: "skipped",
      reason: `Already ${publication.status.toLowerCase()}`,
    };
  }

  const fail = async (reason: string): Promise<PublishResult> => {
    await db.newsPublication.update({
      where: { id: publicationId },
      data: {
        status: publication.attempts + 1 >= MAX_PUBLISH_ATTEMPTS ? "FAILED" : "SCHEDULED",
        attempts: { increment: 1 },
        error: reason.slice(0, 500),
      },
    });
    return { publicationId, postId: null, status: "failed", reason };
  };

  if (publication.rendition.status !== "READY") {
    return fail("Rendition is not READY");
  }

  if (!publication.feed.enabled) {
    return fail("Editorial feed is disabled");
  }

  // An editorial account that has been banned by moderation must not be
  // able to publish, exactly like any other banned account.
  if (publication.feed.user.banned) {
    return fail("Editorial feed account is banned");
  }

  const sources = publication.story.references.map((reference) => ({
    publisher: reference.source.publisher,
    url: reference.url,
  }));

  if (sources.length === 0) {
    return fail("Story has no source attribution");
  }

  const content = composePostContent({
    language: publication.language,
    headline: publication.rendition.headline,
    body: publication.rendition.body,
    topic: publication.story.topic,
    confidence: publication.story.confidence,
    isBreaking: publication.story.isBreaking,
    sources,
    correctionNote: publication.correctionNote ?? publication.story.correctionNote,
  });

  if (!isPostLengthValid(content)) {
    return fail(`Composed post length ${content.length} is outside 1..${MAX_POST_LENGTH}`);
  }

  // The source's own RSS image, when its source has been cleared to
  // share it (see ingest.ts). Most sources aren't, so most stories
  // reach here with none - in which case fall back to the linked
  // article's own og:image, exactly like the main feed's link-preview
  // cards already do for any pasted URL. Computed before the
  // transaction below: it is a network call, and must never hold a DB
  // transaction open while it runs.
  const imageUrl =
    publication.story.imageUrl ?? (await fetchFallbackImage(sources[0].url, options.imageFallback));

  try {
    const result = await db.$transaction(async (tx) => {
      const post = await tx.post.create({
        data: {
          content,
          authorId: publication.feed.userId,
          linkUrl: sources[0].url,
          imageUrl,
          mediaType: imageUrl ? "image" : null,
          status: "published",
          type: "POST",
        },
        select: { id: true },
      });

      await tx.newsPublication.update({
        where: { id: publicationId },
        data: {
          status: "PUBLISHED",
          postId: post.id,
          publishedAt: now,
          attempts: { increment: 1 },
          error: null,
        },
      });

      await tx.newsFeed.update({
        where: { id: publication.feedId },
        data: { lastPublishedAt: now },
      });

      await tx.newsStory.update({
        where: { id: publication.storyId },
        data: { status: "PUBLISHED", publishedAt: publication.story.publishedAt ?? now },
      });

      await maybeCreateNewsArticle(tx, {
        storyId: publication.storyId,
        topic: publication.story.topic,
        region: publication.story.region,
        country: publication.story.country,
        isBreaking: publication.story.isBreaking,
        headline: publication.rendition.headline,
        body: publication.rendition.body,
        imageUrl,
        sourceName: sources[0].publisher,
        sourceUrl: sources[0].url,
        authorId: publication.feed.userId,
        now,
      });

      return post.id;
    });

    return { publicationId, postId: result, status: "published", reason: null };
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

/** Publications whose scheduled time has arrived. */
export async function findDuePublications(
  db: PrismaClient,
  now: Date,
  limit: number
): Promise<Array<{ id: string }>> {
  return db.newsPublication.findMany({
    where: {
      status: "SCHEDULED",
      scheduledFor: { lte: now },
      attempts: { lt: MAX_PUBLISH_ATTEMPTS },
    },
    orderBy: { scheduledFor: "asc" },
    select: { id: true },
    take: limit,
  });
}

/**
 * Removes a published item: deletes the post and marks the publication
 * REMOVED with a reason. Used by admin takedown and by corrections that
 * cannot be expressed as an update.
 */
export async function removePublication(
  db: PrismaClient,
  publicationId: string,
  reason: string,
  now: Date
): Promise<void> {
  const publication = await db.newsPublication.findUnique({
    where: { id: publicationId },
    select: {
      postId: true,
      story: { select: { references: { select: { url: true }, take: 1 } } },
    },
  });

  if (!publication) return;

  await db.$transaction(async (tx) => {
    if (publication.postId) {
      await tx.post.delete({ where: { id: publication.postId } }).catch(() => {
        // Already gone (deleted by moderation, say) - the publication
        // still needs to be marked removed.
      });
    }

    const sourceUrl = publication.story.references[0]?.url;
    if (sourceUrl) await removeNewsArticle(tx, sourceUrl);

    await tx.newsPublication.update({
      where: { id: publicationId },
      data: {
        status: "REMOVED",
        removedAt: now,
        removedReason: reason.slice(0, 500),
        postId: null,
      },
    });
  });
}

/**
 * Applies a correction to a published story.
 *
 * The correction is appended to the live post, clearly labelled, rather
 * than the original text being quietly replaced - a reader who saw the
 * first version must be able to see that it changed.
 */
export async function applyCorrection(
  db: PrismaClient,
  storyId: string,
  correctionNote: string,
  now: Date
): Promise<number> {
  const story = await db.newsStory.update({
    where: { id: storyId },
    data: { correctionNote, correctedAt: now },
    include: {
      references: { include: { source: true } },
      publications: {
        where: { status: "PUBLISHED" },
        include: { rendition: true },
      },
    },
  });

  const sources = story.references.map((reference) => ({
    publisher: reference.source.publisher,
    url: reference.url,
  }));

  let updated = 0;

  for (const publication of story.publications) {
    if (!publication.postId) continue;

    const content = composePostContent({
      language: publication.language,
      headline: publication.rendition.headline,
      body: publication.rendition.body,
      topic: story.topic,
      confidence: story.confidence,
      isBreaking: story.isBreaking,
      sources,
      correctionNote,
    });

    if (!isPostLengthValid(content)) continue;

    await db.$transaction([
      db.post.update({ where: { id: publication.postId }, data: { content } }),
      db.newsPublication.update({
        where: { id: publication.id },
        data: { correctionNote, correctedAt: now },
      }),
    ]);

    updated += 1;
  }

  if (sources[0]) {
    await correctNewsArticle(db, sources[0].url, correctionNote);
  }

  return updated;
}
