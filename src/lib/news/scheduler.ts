import type { NewsConfidence, NewsRegion, NewsTopic } from "@prisma/client";
import { isTravelTopic } from "./config";
import { mapToArticleCategory } from "./news-article-bridge";
import { MAX_STORY_AGE_HOURS, MIN_PUBLISHABLE_SCORE, ageHours } from "./ranking";

/*
 * ============================================================
 * Intelligent publication scheduling
 * ============================================================
 *
 * Pure logic - no database, no clock of its own, no side effects - so
 * the distribution rules can be tested exhaustively.
 *
 * The brief is "publish every 2-3 hours", and the trap in it is that
 * "every feed publishes every 2 hours" is spam. So a cycle runs every
 * 2-3 hours, and what it produces is a *plan*: a set of publications
 * spread across the window that follows, chosen so that consecutive
 * posts differ in region, topic and feed.
 *
 * Hard guarantees, in the order they are applied:
 *
 *  1. A story is published at most once per language, ever. Feeds never
 *     repost each other, so there is no way for the network to
 *     manufacture a trend.
 *  2. Every feed has a minimum gap between posts and a daily cap.
 *  3. No region and no topic may take more than a third of a cycle.
 *  4. Routine news is not scheduled into a feed's local quiet hours.
 *     Breaking news and travel alerts may cross them; nothing else can.
 *  5. If nothing qualifies, the plan is empty. There is no filler.
 */

export interface SchedulableStory {
  id: string;
  topic: NewsTopic;
  region: NewsRegion;
  country: string | null;
  importance: number;
  isBreaking: boolean;
  sensitive: boolean;
  confidence: NewsConfidence;
  firstSeenAt: Date;
  /** READY renditions, one per language. */
  renditions: Array<{ id: string; language: string }>;
}

export interface SchedulableFeed {
  id: string;
  region: NewsRegion;
  country: string | null;
  language: string;
  topics: NewsTopic[];
  timezone: string;
  minMinutesBetweenPosts: number;
  maxPostsPerDay: number;
  lastPublishedAt: Date | null;
  /** Publications already made by this feed in the current UTC day. */
  postsToday: number;
}

export interface SchedulerSettings {
  maxPublicationsPerCycle: number;
  maxPublicationsPerDay: number;
  minMinutesBetweenPublications: number;
  requireHumanReviewForSensitive: boolean;
  enabledLanguages: string[];
  enabledTopics: NewsTopic[];
  enabledRegions: NewsRegion[];
  enabledCountries: string[];
}

export interface PlannedSlot {
  storyId: string;
  renditionId: string;
  feedId: string;
  language: string;
  scheduledFor: Date;
  isBreaking: boolean;
}

export interface PlanCycleInput {
  stories: SchedulableStory[];
  feeds: SchedulableFeed[];
  settings: SchedulerSettings;
  now: Date;
  /** Window the plan spreads across, in minutes. */
  windowMinutes: number;
  /** (storyId, language) pairs already published. */
  publishedStoryLanguages: Set<string>;
  /** Publications already made platform-wide in the current UTC day. */
  publicationsToday: number;
  /**
   * Hours since the newest published article in each ZRP News category,
   * null where the category has none at all. Optional: without it the
   * planner behaves exactly as before.
   *
   * Used only to break ties between stories that already clear the
   * publishing bar, so a category nobody has covered today is served
   * before one that published minutes ago. It can never cause a story
   * to be published that would not otherwise qualify.
   */
  categoryCoverage?: Record<string, number | null>;
}

export function storyLanguageKey(storyId: string, language: string): string {
  return `${storyId}:${language}`;
}

/** No region or topic may exceed this share of one cycle. */
const MAX_SHARE_PER_CYCLE = 1 / 3;

function shareCap(maxSlots: number): number {
  return Math.max(1, Math.ceil(maxSlots * MAX_SHARE_PER_CYCLE));
}

/**
 * A category is treated as needing coverage when its newest article is
 * older than this, or when it has none at all.
 */
const COVERAGE_STALE_AFTER_HOURS = 1;

/**
 * Whether the region cap applies to a story.
 *
 * The cap exists so no one part of the world dominates a cycle. GLOBAL
 * is not a part of the world - it is the absence of one, and it is what
 * almost every topic desk's sources carry (technology, crypto, science,
 * sports, culture, gaming, business, politics, world). Counting them as
 * a single bloc capped the whole wire at a third of the cycle: nine
 * categories each holding one fresh, publishable story, against a
 * budget of 24, planned 8 and left the ninth empty.
 *
 * The topic cap still applies to every story, so no single subject can
 * take more than its share - which is the diversity guarantee that
 * actually matters here.
 */
function regionIsCapped(region: NewsRegion): boolean {
  return region !== "GLOBAL";
}

/**
 * Categories with nothing fresh, which both generation and publication
 * should serve first.
 *
 * This is a priority, never a licence: only stories that already pass
 * every eligibility and quality rule are ever considered, so an empty
 * category with no genuine news stays empty.
 *
 * Exported so pipeline.ts's generation-candidate selection uses the
 * identical definition of "starved" that publication planning does,
 * rather than two independently-tuned thresholds drifting apart.
 */
export function starvedCategories(
  coverage: Record<string, number | null> | undefined
): Set<string> {
  const starved = new Set<string>();
  if (!coverage) return starved;
  for (const [category, ageHoursValue] of Object.entries(coverage)) {
    if (ageHoursValue === null || ageHoursValue >= COVERAGE_STALE_AFTER_HOURS) {
      starved.add(category);
    }
  }
  return starved;
}

/** Whether a feed's editorial remit covers a story. */
export function feedCoversStory(feed: SchedulableFeed, story: SchedulableStory): boolean {
  if (feed.topics.length > 0 && !feed.topics.includes(story.topic)) return false;

  // A national feed only takes its own country's stories.
  if (feed.country) return feed.country === story.country;

  // A regional feed takes anything from its region.
  if (feed.region !== "GLOBAL") return feed.region === story.region;

  // A global feed takes anything.
  return true;
}

export function feedIsAvailableAt(feed: SchedulableFeed, at: Date, story: SchedulableStory): boolean {
  if (feed.postsToday >= feed.maxPostsPerDay) return false;

  if (feed.lastPublishedAt) {
    const nextAllowed = new Date(
      feed.lastPublishedAt.getTime() + feed.minMinutesBetweenPosts * 60 * 1000
    );
    if (at < nextAllowed) return false;
  }

  /*
   * No quiet hours. ZRP News is a continuous 24/7 wire: every category
   * is expected to carry fresh content in every hourly window, and a
   * reader opening /news at 03:00 should not find the last seven hours
   * empty.
   *
   * This previously skipped any non-urgent story between 23:00 and
   * 06:00 in the feed's own timezone, which silently removed a third of
   * every day from the publishing schedule. The anti-flood limits above
   * (a minimum gap between posts, and a daily cap per feed) are what
   * keep a feed from flooding - they do that at every hour equally,
   * which is the property that actually matters.
   */
  return true;
}

/** Whether a story is eligible for automated publication at all. */
export function storyIsEligible(
  story: SchedulableStory,
  settings: SchedulerSettings,
  now: Date
): boolean {
  if (story.importance < MIN_PUBLISHABLE_SCORE) return false;
  if (ageHours(story.firstSeenAt, now) >= MAX_STORY_AGE_HOURS) return false;

  // Sensitive stories never auto-publish while human review is
  // required. They stay in the admin queue rather than being dropped.
  if (story.sensitive && settings.requireHumanReviewForSensitive) return false;

  if (settings.enabledTopics.length > 0 && !settings.enabledTopics.includes(story.topic)) {
    return false;
  }
  if (settings.enabledRegions.length > 0 && !settings.enabledRegions.includes(story.region)) {
    return false;
  }
  if (
    settings.enabledCountries.length > 0 &&
    story.country &&
    !settings.enabledCountries.includes(story.country)
  ) {
    return false;
  }

  return true;
}

/**
 * Ranks stories for this cycle: corroborated breaking news first, then
 * by importance, then oldest-first so a story cannot be starved out by
 * a steady drip of marginally better ones.
 */
export function rankStories(stories: SchedulableStory[]): SchedulableStory[] {
  return [...stories].sort((a, b) => {
    if (a.isBreaking !== b.isBreaking) return a.isBreaking ? -1 : 1;
    if (b.importance !== a.importance) return b.importance - a.importance;
    return a.firstSeenAt.getTime() - b.firstSeenAt.getTime();
  });
}

/**
 * Builds the publication plan for one cycle.
 *
 * Returns an empty array when nothing qualifies. That is a correct,
 * expected outcome - a quiet three hours produces no posts.
 */
export function planCycle(input: PlanCycleInput): PlannedSlot[] {
  const { stories, feeds, settings, now, windowMinutes, publishedStoryLanguages } = input;

  const starved = starvedCategories(input.categoryCoverage);

  /** The ZRP News category a story would end up in once published. */
  const categoryOf = (story: SchedulableStory) =>
    mapToArticleCategory({ topic: story.topic, region: story.region, country: story.country });

  const remainingToday = Math.max(
    0,
    settings.maxPublicationsPerDay - input.publicationsToday
  );
  const maxSlots = Math.max(0, Math.min(settings.maxPublicationsPerCycle, remainingToday));
  if (maxSlots === 0) return [];

  const enabledLanguages = new Set(settings.enabledLanguages);
  const perRegionCap = shareCap(maxSlots);
  const perTopicCap = shareCap(maxSlots);

  const regionCount = new Map<NewsRegion, number>();
  const topicCount = new Map<NewsTopic, number>();

  // Mutable copies: a feed's availability changes as we assign to it.
  const feedState = feeds.map((feed) => ({ ...feed }));
  const usedStoryLanguages = new Set(publishedStoryLanguages);

  const slots: PlannedSlot[] = [];

  // Publications are spaced evenly across the window, with the minimum
  // gap as a floor. Breaking news skips the queue and goes out now.
  const spacingMinutes = Math.max(
    settings.minMinutesBetweenPublications,
    Math.floor(windowMinutes / Math.max(1, maxSlots))
  );
  let routineIndex = 0;

  /**
   * Attempts one story, returning true if it took a slot.
   *
   * Every eligibility and quality rule lives here, so both passes below
   * go through exactly the same gate: ordering can bring a starved
   * category forward, but it can never lower the bar for it.
   */
  function tryToSchedule(story: SchedulableStory): boolean {
    if (slots.length >= maxSlots) return false;
    if (!storyIsEligible(story, settings, now)) return false;

    if (regionIsCapped(story.region) && (regionCount.get(story.region) ?? 0) >= perRegionCap) {
      return false;
    }
    if ((topicCount.get(story.topic) ?? 0) >= perTopicCap) return false;

    let took = false;

    for (const rendition of story.renditions) {
      if (slots.length >= maxSlots) break;
      if (!enabledLanguages.has(rendition.language)) continue;

      const key = storyLanguageKey(story.id, rendition.language);
      if (usedStoryLanguages.has(key)) continue;

      const scheduledFor = story.isBreaking
        ? now
        : new Date(now.getTime() + routineIndex * spacingMinutes * 60 * 1000);

      const feed = feedState.find(
        (candidate) =>
          candidate.language === rendition.language &&
          feedCoversStory(candidate, story) &&
          feedIsAvailableAt(candidate, scheduledFor, story)
      );

      if (!feed) continue;

      slots.push({
        storyId: story.id,
        renditionId: rendition.id,
        feedId: feed.id,
        language: rendition.language,
        scheduledFor,
        isBreaking: story.isBreaking,
      });

      usedStoryLanguages.add(key);
      feed.lastPublishedAt = scheduledFor;
      feed.postsToday += 1;

      regionCount.set(story.region, (regionCount.get(story.region) ?? 0) + 1);
      topicCount.set(story.topic, (topicCount.get(story.topic) ?? 0) + 1);

      if (!story.isBreaking) routineIndex += 1;
      took = true;
    }

    return took;
  }

  const ranked = rankStories(stories);
  const attempted = new Set<string>();

  /*
   * Pass one: one slot for each category that currently has nothing
   * fresh, best story first. Without this the plan is ranked purely by
   * importance, so a category with nothing for three days gets no
   * preference over one that published minutes ago - and covering every
   * category was left to chance.
   *
   * One per category, so a single starved category cannot take the
   * whole cycle and crowd out the others.
   */
  if (starved.size > 0) {
    const servedThisCycle = new Set<string>();

    for (const story of ranked) {
      if (slots.length >= maxSlots) break;

      const category = categoryOf(story);
      if (!starved.has(category) || servedThisCycle.has(category)) continue;

      attempted.add(story.id);
      if (tryToSchedule(story)) servedThisCycle.add(category);
    }
  }

  // Pass two: fill the rest of the cycle exactly as before.
  for (const story of ranked) {
    if (slots.length >= maxSlots) break;
    if (attempted.has(story.id)) continue;
    tryToSchedule(story);
  }

  return slots.sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());
}

/**
 * Deterministic idempotency key for a planned publication.
 *
 * Deliberately (story, language) and NOT (story, language, feed): under
 * the UNIQUE constraint on NewsPublication.idempotencyKey, this makes
 * "one publication per story per language" a database guarantee rather
 * than something the planner has to remember. A retried cycle, an
 * overlapping run, or a bug that routes the same story to a second feed
 * all collide on the same key and lose.
 */
export function idempotencyKeyFor(storyId: string, language: string): string {
  return `${storyId}:${language}`;
}
