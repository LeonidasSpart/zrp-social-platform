import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { acquirePipelineLock } from "./lock";
import { buildStoryIndex, expireStaleStories, ingestSource, isSourceDue } from "./ingest";
import { MAX_STORY_AGE_HOURS, MIN_PUBLISHABLE_SCORE } from "./ranking";
import { generateRenditions, type GenerationContext } from "./generate";
import { isNewsLanguage, type NewsLanguage } from "./config";
import { CYCLE_WINDOW_MINUTES, getAutomationSettings, nextCycleAt, toSchedulerSettings } from "./settings";
import { planCycle, storyLanguageKey, type SchedulableFeed, type SchedulableStory } from "./scheduler";
import { findDuePublications, publishDuePublication, reservePublication } from "./publish";

/*
 * ============================================================
 * The editorial pipeline
 * ============================================================
 *
 * One cycle, run every 2-3 hours:
 *
 *   0. take the lock (or do nothing)
 *   1. publish anything the previous cycle scheduled that is now due
 *   2. poll the sources that are due
 *   3. age out stories too old to publish
 *   4. write summaries for the best unwritten stories, in every enabled
 *      language, validating each one
 *   5. plan the next window's publications and reserve them
 *
 * Every stage is individually failure-tolerant and none of them can
 * invent content. If sources are down, stage 2 records failures and
 * stages 4-5 find nothing to do. If the model is down, stage 4 records
 * failures and stage 5 finds no READY renditions. A cycle that
 * publishes nothing is a normal outcome, not an error.
 */

/** Lock TTL. Comfortably longer than a cycle, shorter than the gap. */
const LOCK_TTL_SECONDS = 25 * 60;

/** Sources polled per cycle, so one cycle's outbound work is bounded. */
const MAX_SOURCES_PER_CYCLE = 40;

/** Stories summarised per cycle, bounding model spend per run. */
const MAX_GENERATIONS_PER_CYCLE = 10;

export interface CycleResult {
  ran: boolean;
  jobRunId: string | null;
  reason: string | null;
  sourcesFetched: number;
  sourcesFailed: number;
  itemsIngested: number;
  storiesCreated: number;
  duplicatesPrevented: number;
  renditionsGenerated: number;
  renditionsFailed: number;
  published: number;
  publishFailures: number;
  scheduled: number;
  storiesExpired: number;
}

function emptyResult(reason: string): CycleResult {
  return {
    ran: false,
    jobRunId: null,
    reason,
    sourcesFetched: 0,
    sourcesFailed: 0,
    itemsIngested: 0,
    storiesCreated: 0,
    duplicatesPrevented: 0,
    renditionsGenerated: 0,
    renditionsFailed: 0,
    published: 0,
    publishFailures: 0,
    scheduled: 0,
    storiesExpired: 0,
  };
}

export function startOfUtcDay(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

export interface RunCycleOptions {
  trigger?: "cron" | "manual";
  now?: Date;
  db?: PrismaClient;
  /** Skip the distributed lock. Only ever set by tests. */
  skipLock?: boolean;
}

export async function runPipelineCycle(options: RunCycleOptions = {}): Promise<CycleResult> {
  const db = options.db ?? (prisma);
  const now = options.now ?? new Date();
  const trigger = options.trigger ?? "cron";

  const settings = await getAutomationSettings(db);

  if (settings.paused) {
    return emptyResult("Automation is paused");
  }

  const lock = options.skipLock ? { release: async () => {} } : await acquirePipelineLock(LOCK_TTL_SECONDS);

  if (!lock) {
    // Either another cycle holds the lock, or Redis is unavailable. Both
    // mean "do not run": see lock.ts for why this fails closed.
    return emptyResult("Could not acquire the pipeline lock");
  }

  const jobRun = await db.newsJobRun.create({
    data: { trigger, status: "RUNNING", startedAt: now },
    select: { id: true },
  });

  const result: CycleResult = { ...emptyResult(""), ran: true, jobRunId: jobRun.id, reason: null };

  try {
    // ─── 1. Publish what is due ───────────────────────────────
    const due = await findDuePublications(db, now, settings.maxPublicationsPerCycle);
    for (const publication of due) {
      const outcome = await publishDuePublication(db, publication.id, now);
      if (outcome.status === "published") result.published += 1;
      else if (outcome.status === "failed") result.publishFailures += 1;
    }

    // ─── 2. Poll due sources ──────────────────────────────────
    const sources = await db.newsSource.findMany({
      where: { enabled: true, OR: [{ backoffUntil: null }, { backoffUntil: { lte: now } }] },
      orderBy: { lastFetchedAt: { sort: "asc", nulls: "first" } },
      take: MAX_SOURCES_PER_CYCLE,
    });

    const index = await buildStoryIndex(db, now);

    for (const source of sources) {
      if (!isSourceDue(source, now)) continue;

      const summary = await ingestSource(source, index, now, db);

      result.sourcesFetched += 1;
      if (!summary.ok) result.sourcesFailed += 1;
      result.itemsIngested += summary.created + summary.merged;
      result.storiesCreated += summary.created;
      // A merge is a duplicate story that did NOT become its own post,
      // which is exactly what the "duplicates prevented" figure means.
      result.duplicatesPrevented += summary.merged + summary.duplicates;
    }

    // ─── 3. Age out stale stories ─────────────────────────────
    result.storiesExpired = await expireStaleStories(db, now, MAX_STORY_AGE_HOURS);

    // ─── 4. Write summaries ───────────────────────────────────
    const languages = settings.enabledLanguages.filter(isNewsLanguage) as NewsLanguage[];

    if (languages.length > 0) {
      const cutoff = new Date(now.getTime() - MAX_STORY_AGE_HOURS * 60 * 60 * 1000);

      const candidates = await db.newsStory.findMany({
        where: {
          status: "NEW",
          importance: { gte: MIN_PUBLISHABLE_SCORE },
          firstSeenAt: { gte: cutoff },
          // Sensitive stories wait for a person while review is
          // required; there is no point spending model calls on them.
          ...(settings.requireHumanReviewForSensitive ? { sensitive: false } : {}),
        },
        orderBy: [{ isBreaking: "desc" }, { importance: "desc" }],
        take: MAX_GENERATIONS_PER_CYCLE,
        include: { references: { include: { source: true } } },
      });

      for (const story of candidates) {
        // Travel stories are the ones that must exist in all four
        // languages. Everything else is written in the languages its
        // own audience reads, so we are not paying to translate a local
        // Australian story into Italian.
        const targetLanguages = story.isTravel
          ? languages
          : languages.filter(
              (language) => language === "en" || language === story.language
            );

        if (targetLanguages.length === 0) continue;

        const context: GenerationContext = {
          storyTitle: story.title,
          sourceMaterial: story.sourceMaterial,
          topic: story.topic,
          confidence: story.confidence,
          isTravel: story.isTravel,
          publishers: Array.from(
            new Set(story.references.map((reference) => reference.source.publisher))
          ),
        };

        const outcomes = await generateRenditions(targetLanguages, context);

        let anyReady = false;

        for (const outcome of outcomes) {
          const data = outcome.rendition
            ? {
                headline: outcome.rendition.headline,
                body: outcome.rendition.body,
                status: "READY" as const,
                model: outcome.rendition.model,
                error: null,
                validation: outcome.rendition.validation as object,
              }
            : {
                headline: "",
                body: "",
                status: "FAILED" as const,
                model: null,
                error: outcome.error,
                validation: (outcome.validation ?? undefined) as object | undefined,
              };

          await db.newsRendition.upsert({
            where: { storyId_language: { storyId: story.id, language: outcome.language } },
            update: data,
            create: { storyId: story.id, language: outcome.language, ...data },
          });

          if (outcome.rendition) {
            anyReady = true;
            result.renditionsGenerated += 1;
          } else {
            result.renditionsFailed += 1;
          }
        }

        await db.newsStory.update({
          where: { id: story.id },
          data: anyReady
            ? { status: "READY" }
            : {
                status: "REJECTED",
                rejectionReason:
                  "No summary passed groundedness validation in any enabled language",
              },
        });
      }
    }

    // ─── 5. Plan the next window ──────────────────────────────
    const readyStories = await db.newsStory.findMany({
      where: {
        // PUBLISHED is included deliberately. Publishing a story in one
        // language flips it to PUBLISHED, and without this a travel
        // story that reached an English feed in one cycle could never
        // reach the French, German or Italian desks in a later one -
        // which is exactly the four-language guarantee. Re-publishing
        // the *same* language is blocked separately, by
        // publishedStoryLanguages and the idempotency key.
        status: { in: ["READY", "PUBLISHED"] },
        firstSeenAt: { gte: new Date(now.getTime() - MAX_STORY_AGE_HOURS * 60 * 60 * 1000) },
      },
      orderBy: { importance: "desc" },
      take: 200,
      include: { renditions: { where: { status: "READY" }, select: { id: true, language: true } } },
    });

    const feedRows = await db.newsFeed.findMany({ where: { enabled: true } });

    const dayStart = startOfUtcDay(now);

    const publicationsToday = await db.newsPublication.count({
      where: { status: "PUBLISHED", publishedAt: { gte: dayStart } },
    });

    const perFeedToday = await db.newsPublication.groupBy({
      by: ["feedId"],
      where: { status: { in: ["PUBLISHED", "SCHEDULED"] }, createdAt: { gte: dayStart } },
      _count: { _all: true },
    });

    const todayByFeed = new Map(perFeedToday.map((row) => [row.feedId, row._count._all]));

    // Anything already published or queued for a story+language must
    // never be planned again.
    const existingPublications = await db.newsPublication.findMany({
      where: { storyId: { in: readyStories.map((story) => story.id) } },
      select: { storyId: true, language: true },
    });

    const publishedStoryLanguages = new Set(
      existingPublications.map((row) => storyLanguageKey(row.storyId, row.language))
    );

    const stories: SchedulableStory[] = readyStories.map((story) => ({
      id: story.id,
      topic: story.topic,
      region: story.region,
      country: story.country,
      importance: story.importance,
      isBreaking: story.isBreaking,
      sensitive: story.sensitive,
      confidence: story.confidence,
      firstSeenAt: story.firstSeenAt,
      renditions: story.renditions,
    }));

    const feeds: SchedulableFeed[] = feedRows.map((feed) => ({
      id: feed.id,
      region: feed.region,
      country: feed.country,
      language: feed.language,
      topics: feed.topics,
      timezone: feed.timezone,
      minMinutesBetweenPosts: feed.minMinutesBetweenPosts,
      maxPostsPerDay: feed.maxPostsPerDay,
      lastPublishedAt: feed.lastPublishedAt,
      postsToday: todayByFeed.get(feed.id) ?? 0,
    }));

    const plan = planCycle({
      stories,
      feeds,
      settings: toSchedulerSettings(settings),
      now,
      windowMinutes: CYCLE_WINDOW_MINUTES,
      publishedStoryLanguages,
      publicationsToday,
    });

    for (const slot of plan) {
      const reserved = await reservePublication(db, slot);
      if (!reserved) {
        // Lost the idempotency race - correct behaviour, not a failure.
        result.duplicatesPrevented += 1;
        continue;
      }

      result.scheduled += 1;

      // Breaking news is scheduled for "now", so publish it in this
      // same cycle rather than making readers wait for the next one.
      if (slot.scheduledFor <= now) {
        const outcome = await publishDuePublication(db, reserved.id, now);
        if (outcome.status === "published") result.published += 1;
        else if (outcome.status === "failed") result.publishFailures += 1;
      }
    }

    const finishedAt = new Date();

    await db.newsJobRun.update({
      where: { id: jobRun.id },
      data: {
        status: "SUCCEEDED",
        finishedAt,
        sourcesFetched: result.sourcesFetched,
        sourcesFailed: result.sourcesFailed,
        itemsIngested: result.itemsIngested,
        storiesCreated: result.storiesCreated,
        duplicatesPrevented: result.duplicatesPrevented,
        renditionsGenerated: result.renditionsGenerated,
        renditionsFailed: result.renditionsFailed,
        published: result.published,
        publishFailures: result.publishFailures,
        details: { scheduled: result.scheduled, storiesExpired: result.storiesExpired },
      },
    });

    await db.newsAutomationSetting.update({
      where: { id: settings.id },
      data: { lastCycleAt: now, nextCycleAt: nextCycleAt(now) },
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await db.newsJobRun
      .update({
        where: { id: jobRun.id },
        data: { status: "FAILED", finishedAt: new Date(), error: message.slice(0, 2000) },
      })
      .catch(() => {
        // Nothing further to do: the throw below is what matters.
      });

    throw error;
  } finally {
    await lock.release();
  }
}
