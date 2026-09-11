import { NewsArticleCategory, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { acquirePipelineLock } from "./lock";
import { buildStoryIndex, expireStaleStories, ingestSource, isSourceDue } from "./ingest";
import { ageHours, MAX_STORY_AGE_HOURS, MIN_PUBLISHABLE_SCORE } from "./ranking";
import {
  generateRenditions,
  NEWS_MODEL_MAX_RETRIES,
  NEWS_MODEL_TIMEOUT_MS,
  type GenerationContext,
} from "./generate";
import { isNewsLanguage, type NewsLanguage } from "./config";
import { CYCLE_WINDOW_MINUTES, getAutomationSettings, nextCycleAt, toSchedulerSettings } from "./settings";
import {
  planCycle,
  starvedCategories,
  storyLanguageKey,
  type SchedulableFeed,
  type SchedulableStory,
} from "./scheduler";
import { findDuePublications, publishDuePublication, reservePublication } from "./publish";
import { mapToArticleCategory } from "./news-article-bridge";

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

/*
 * Stories summarised per cycle, bounding model spend per run.
 *
 * ZRP News runs hourly and is expected to fill twelve categories, so a
 * cycle has to be able to produce more than a handful of summaries or
 * the categories starve no matter how much real news was ingested.
 */
/**
 * How fresh a story must still be to be worth retrying after a
 * non-editorial generation failure (empty completion, unparseable
 * JSON, timeout, provider error).
 *
 * Measured from the story's publication time, not from the first
 * attempt, so it bounds retries without needing an attempt counter:
 * with hourly cycles a story gets a handful of tries while it is fresh
 * enough to matter, and one already older than this is rejected on its
 * first failure rather than retried into irrelevance. Long enough to
 * ride out a provider outage lasting several cycles.
 */
const GENERATION_RETRY_WINDOW_HOURS = 6;

const MAX_GENERATIONS_PER_CYCLE = 24;

/*
 * The generation candidate query fetches this many times
 * MAX_GENERATIONS_PER_CYCLE so the starved-category pass below has a
 * wide enough pool to actually find a candidate from a thin category -
 * the same reason planCycle's starvation pass works from all ranked
 * stories rather than just the top MAX_GENERATIONS_PER_CYCLE.
 */
const GENERATION_POOL_MULTIPLIER = 4;

/*
 * Wall-clock budget for the summarisation stage.
 *
 * Summarisation is the only unbounded-ish stage (dozens of model
 * calls), and if it consumes the whole request the cycle is killed
 * before stage 5 ever runs - so a cycle that generated perfectly good
 * summaries publishes nothing, and its NewsJobRun is left RUNNING
 * forever with no error recorded.
 *
 * Sized against the cron route's own maxDuration (900s) and the
 * caller's curl timeout, leaving headroom for planning and publishing.
 * It is deliberately generous now that the model reasons before it
 * writes - each call takes noticeably longer than it used to, and a
 * three-minute budget produced only a couple of summaries an hour.
 *
 * Stories not reached stay NEW and are the next cycle's first pick:
 * nothing is lost, and nothing is rejected for a delay that was not its
 * fault.
 */
const GENERATION_BUDGET_MS = 600_000;

/** Every category /news displays, so coverage is reported for all of them. */
const NEWS_ARTICLE_CATEGORIES = Object.values(NewsArticleCategory);

/**
 * Two-pass selection: one slot for each currently-starved category (best
 * candidate first, per `pool`'s own order), then fill the remaining
 * budget by that same order. Mirrors planCycle's starvation pass in
 * scheduler.ts, applied here to generation instead of publication - a
 * flat "top N" cut lets a thin category's only eligible story lose the
 * ranking every cycle and never get attempted at all.
 *
 * A pure function over plain objects (not the database) so the
 * starvation behaviour itself can be tested directly.
 */
export function selectStarvedFirst<T>(
  pool: readonly T[],
  starved: ReadonlySet<string>,
  categoryOf: (item: T) => string,
  max: number
): T[] {
  const selected: T[] = [];
  const takenFromPool = new Set<T>();

  if (starved.size > 0) {
    const servedThisCycle = new Set<string>();

    for (const item of pool) {
      if (selected.length >= max) break;

      const category = categoryOf(item);
      if (!starved.has(category) || servedThisCycle.has(category)) continue;

      takenFromPool.add(item);
      selected.push(item);
      servedThisCycle.add(category);
    }
  }

  for (const item of pool) {
    if (selected.length >= max) break;
    if (takenFromPool.has(item)) continue;
    selected.push(item);
  }

  return selected;
}

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
  /**
   * Stories held back for another cycle because every language failed
   * for a non-editorial reason (empty completion, unparseable JSON,
   * timeout, provider error) rather than being rejected outright.
   *
   * Reported separately so a provider having a bad hour is visible as
   * exactly that, instead of looking like a wave of rejected news.
   */
  renditionsRetryable: number;
  published: number;
  publishFailures: number;
  scheduled: number;
  storiesExpired: number;
  /**
   * True when summarisation hit its wall-clock budget. Stories it did not
   * reach are untouched and will be picked up next cycle.
   */
  generationBudgetExhausted: boolean;
  /**
   * Age in hours of the newest published article in each ZRP News
   * category, or null when that category has none at all.
   *
   * Every hourly cycle reports this so category starvation is visible
   * in the run's own output instead of only on the live site. It is a
   * measurement, never a trigger to manufacture content: a category
   * with no genuine fresh story simply reports its real age.
   */
  categoryCoverage: Record<string, number | null>;
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
    renditionsRetryable: 0,
    published: 0,
    publishFailures: 0,
    scheduled: 0,
    storiesExpired: 0,
    generationBudgetExhausted: false,
    categoryCoverage: {},
  };
}

/**
 * Hours since the newest published article in each ZRP News category,
 * null where a category has none.
 *
 * Read straight from what /news actually serves, so the number reported
 * is the number a reader would experience.
 */
export async function measureCategoryCoverage(
  db: PrismaClient,
  now: Date
): Promise<Record<string, number | null>> {
  const newest = await db.newsArticle.groupBy({
    by: ["category"],
    where: { status: "PUBLISHED", publishedAt: { not: null } },
    _max: { publishedAt: true },
  });

  const byCategory = new Map(newest.map((row) => [row.category, row._max.publishedAt]));

  const coverage: Record<string, number | null> = {};
  for (const category of NEWS_ARTICLE_CATEGORIES) {
    const publishedAt = byCategory.get(category) ?? null;
    coverage[category] = publishedAt
      ? Math.round(((now.getTime() - publishedAt.getTime()) / 3_600_000) * 10) / 10
      : null;
  }
  return coverage;
}

export function startOfUtcDay(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

export interface RunCycleOptions {
  /**
   * Who asked for this cycle, recorded on the job run.
   *
   * "scheduler" is the app's own hourly timer (see instrumentation.ts),
   * "cron" the GitHub workflow that backs it up, "manual" an admin. Kept
   * distinct so it is always clear which trigger a run came from.
   */
  trigger?: "cron" | "manual" | "scheduler";
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

    /*
     * Measured once here and reused for both generation (below) and
     * publication planning (step 5): both stages need to know which
     * categories currently have nothing, and they should agree on it
     * within one cycle rather than each computing their own snapshot.
     */
    const categoryCoverage = await measureCategoryCoverage(db, now);
    const starved = starvedCategories(categoryCoverage);

    // ─── 4. Write summaries ───────────────────────────────────
    const languages = settings.enabledLanguages.filter(isNewsLanguage) as NewsLanguage[];

    if (languages.length > 0) {
      const cutoff = new Date(now.getTime() - MAX_STORY_AGE_HOURS * 60 * 60 * 1000);

      /*
       * A flat "top N by importance" query starves generation exactly
       * the way the publication planner used to starve publishing
       * (fixed in #243): a modest-but-genuinely-publishable story in a
       * thin category (Crypto has no tier-1/2 source, so it never wins
       * on raw score against a corroborated World/Politics story) can
       * lose that race every single cycle for its entire lifetime and
       * never get a rendition attempt at all - not rejected, just never
       * tried. Found in production: a real, publishable (score 2.69,
       * not sensitive) Crypto story sat at status NEW with zero
       * renditions for almost 24 hours while the category it belonged
       * to stayed empty.
       *
       * Same two-pass shape as planCycle: fetch a wider pool than the
       * budget, give one slot to the best candidate from each starved
       * category first, then fill the rest by the original rank. Never
       * a licence - every candidate here already passed the identical
       * where-clause (score floor, freshness, sensitivity hold).
       */
      const pool = await db.newsStory.findMany({
        where: {
          status: "NEW",
          importance: { gte: MIN_PUBLISHABLE_SCORE },
          firstSeenAt: { gte: cutoff },
          // Sensitive stories wait for a person while review is
          // required; there is no point spending model calls on them.
          ...(settings.requireHumanReviewForSensitive ? { sensitive: false } : {}),
        },
        orderBy: [{ isBreaking: "desc" }, { importance: "desc" }],
        take: MAX_GENERATIONS_PER_CYCLE * GENERATION_POOL_MULTIPLIER,
        include: { references: { include: { source: true } } },
      });

      /** The ZRP News category a story would end up in once published. */
      const categoryOfStory = (story: (typeof pool)[number]) =>
        mapToArticleCategory({ topic: story.topic, region: story.region, country: story.country });

      const candidates = selectStarvedFirst(pool, starved, categoryOfStory, MAX_GENERATIONS_PER_CYCLE);

      const generationDeadline = Date.now() + GENERATION_BUDGET_MS;

      for (const story of candidates) {
        if (Date.now() >= generationDeadline) {
          // Out of budget. Remaining candidates keep status NEW and are
          // the next cycle's first pick.
          result.generationBudgetExhausted = true;
          break;
        }

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

        const outcomes = await generateRenditions(targetLanguages, context, {
          deadline: generationDeadline,
        });

        let anyReady = false;
        let anySkippedForBudget = false;
        // A summary the validator refused is a real editorial rejection.
        // An empty response, unparseable JSON or a timeout is not: the
        // story did nothing wrong and deserves another cycle.
        let anyEditorialRejection = false;

        for (const outcome of outcomes) {
          if (outcome.skippedForBudget) {
            anySkippedForBudget = true;
            result.generationBudgetExhausted = true;
            // Nothing recorded: an unattempted language is not a failed
            // one, and must not show up in the failure counters.
            continue;
          }

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
            if (outcome.validation) anyEditorialRejection = true;
          }
        }

        if (anyReady) {
          await db.newsStory.update({
            where: { id: story.id },
            data: { status: "READY" },
          });
        } else if (anySkippedForBudget) {
          // Ran out of time, not out of quality. Leave it NEW so the next
          // cycle retries it rather than rejecting a story that was never
          // actually assessed.
          result.generationBudgetExhausted = true;
        } else if (
          !anyEditorialRejection &&
          ageHours(story.firstSeenAt, now) < GENERATION_RETRY_WINDOW_HOURS
        ) {
          /*
           * Every language failed for a reason that is ours, not the
           * story's: an empty completion, unparseable JSON, a timeout, a
           * provider error. Rejecting here throws away real news for a
           * transient fault - a provider outage lasting one cycle used
           * to permanently discard every story in flight, and a
           * production sample of 187 failures found 102 of exactly this
           * kind against 11 genuine groundedness rejections.
           *
           * Leave it NEW so the next cycle tries again. Retries are
           * bounded twice over: by this window, and by the story ageing
           * out entirely at MAX_STORY_AGE_HOURS.
           */
          result.renditionsRetryable += 1;
        } else {
          await db.newsStory.update({
            where: { id: story.id },
            data: {
              status: "REJECTED",
              rejectionReason: anyEditorialRejection
                ? "No summary passed groundedness validation in any enabled language"
                : "Summary generation kept failing for a non-editorial reason; see the rendition error",
            },
          });
        }
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

    /*
     * Reuses the snapshot measured before generation (step 4) rather
     * than measuring again: nothing between there and here publishes an
     * article, so a second query would only ever repeat the same
     * answer - and sharing one snapshot keeps generation and
     * publication planning agreeing on exactly which categories are
     * starved within a cycle. It is measured again after publishing for
     * the run's report.
     */
    const plan = planCycle({
      stories,
      feeds,
      settings: toSchedulerSettings(settings),
      now,
      windowMinutes: CYCLE_WINDOW_MINUTES,
      publishedStoryLanguages,
      publicationsToday,
      categoryCoverage,
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

    // Measured after publishing, so the run reports the coverage it
    // actually left behind rather than the one it started with.
    result.categoryCoverage = await measureCategoryCoverage(db, finishedAt);

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
        details: {
          scheduled: result.scheduled,
          storiesExpired: result.storiesExpired,
          renditionsRetryable: result.renditionsRetryable,
          generationBudgetExhausted: result.generationBudgetExhausted,
          modelTimeoutMs: NEWS_MODEL_TIMEOUT_MS,
          modelMaxRetries: NEWS_MODEL_MAX_RETRIES,
          categoryCoverage: result.categoryCoverage,
        },
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
