import type { NewsSource, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { safeFetch, SsrfBlockedError } from "@/lib/ssrf-guard";
import { parseFeed } from "./rss";
import { isFeedUrlAllowed } from "./robots";
import { fingerprint, findDuplicate, normalizeTitle } from "./dedupe";
import { assessConfidence, classifyTopic, detectBreaking, detectSensitive } from "./classify";
import { isTravelTopic } from "./config";
import { scoreStory } from "./ranking";
import type { RawFeedItem } from "./types";

/*
 * ============================================================
 * Source ingestion
 * ============================================================
 *
 * Polls a publisher's own syndication feed, politely:
 *
 *  - robots.txt is checked and obeyed before any fetch
 *  - conditional GET (ETag / If-Modified-Since) so an unchanged feed
 *    costs the publisher a 304, not a transfer
 *  - one request per source per cycle, never a crawl of their site
 *  - hard timeout and response-size cap (inherited from safeFetch)
 *  - exponential backoff on failure, so a struggling publisher is not
 *    hammered by a retry storm
 *
 * What is retained per item is the headline, the publisher's own
 * syndicated abstract (capped at 600 characters), the canonical link,
 * the timestamp and any declared preview image. The article itself is
 * never fetched.
 */

const USER_AGENT =
  "ZRPNewsBot/1.0 (+https://zrp.one/about; ZRP News Network editorial feed reader)";

const MAX_FEED_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 10_000;

// Backoff schedule: 15min, 30min, 1h, 2h, 4h, 8h, then flat 12h.
const BASE_BACKOFF_MINUTES = 15;
const MAX_BACKOFF_MINUTES = 12 * 60;

export function backoffMinutesFor(consecutiveFailures: number): number {
  const exponent = Math.max(0, consecutiveFailures - 1);
  const minutes = BASE_BACKOFF_MINUTES * Math.pow(2, Math.min(exponent, 6));
  return Math.min(minutes, MAX_BACKOFF_MINUTES);
}

export function sourceStatusFor(consecutiveFailures: number): "HEALTHY" | "WARNING" | "FAILED" {
  if (consecutiveFailures === 0) return "HEALTHY";
  if (consecutiveFailures < 3) return "WARNING";
  return "FAILED";
}

/*
 * A poll interval is a target cadence, not a deadline to the second.
 *
 * The poller only runs when a cycle runs, so a source that is a few
 * seconds short of due when a cycle starts does not wait a few seconds
 * - it waits for the whole next cycle. With most sources on a 60-minute
 * interval and cycles now running hourly, the two are exactly in phase,
 * and GitHub's own several-minute jitter on scheduled workflows decides
 * the outcome: a cycle that starts marginally earlier than the previous
 * one skips every source, which is how a production cycle reported
 * sourcesFetched: 0 with nothing actually wrong.
 *
 * Treating "within 10% of the interval" as due costs nothing (a source
 * polled at 54 minutes instead of 60 is still polite) and removes the
 * phase alignment entirely, at any interval: 15-minute sources get 90
 * seconds of tolerance, hourly ones get six minutes.
 */
const POLL_DUE_TOLERANCE = 0.1;

/** Whether a source is due for a poll right now. */
export function isSourceDue(
  source: Pick<NewsSource, "enabled" | "backoffUntil" | "lastFetchedAt" | "fetchIntervalMinutes">,
  now: Date
): boolean {
  if (!source.enabled) return false;
  if (source.backoffUntil && source.backoffUntil > now) return false;
  if (!source.lastFetchedAt) return true;

  const intervalMs = source.fetchIntervalMinutes * 60 * 1000;
  const dueAt = new Date(
    source.lastFetchedAt.getTime() + intervalMs - intervalMs * POLL_DUE_TOLERANCE
  );
  return dueAt <= now;
}

export interface FetchOutcome {
  ok: boolean;
  notModified: boolean;
  items: RawFeedItem[];
  etag: string | null;
  lastModified: string | null;
  error: string | null;
}

/**
 * Fetches and parses one source. Never throws - every failure mode
 * (blocked by robots, network error, non-2xx, unparseable body) comes
 * back as `ok: false` with a reason, because a single bad source must
 * never abort a pipeline cycle.
 */
export async function fetchSource(
  source: Pick<NewsSource, "feedUrl" | "etag" | "lastModified">
): Promise<FetchOutcome> {
  const empty: FetchOutcome = {
    ok: false,
    notModified: false,
    items: [],
    etag: null,
    lastModified: null,
    error: null,
  };

  let allowed: boolean;
  try {
    allowed = await isFeedUrlAllowed(source.feedUrl);
  } catch {
    return { ...empty, error: "robots.txt check failed" };
  }

  if (!allowed) {
    return { ...empty, error: "Disallowed by robots.txt" };
  }

  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
  };
  if (source.etag) headers["If-None-Match"] = source.etag;
  if (source.lastModified) headers["If-Modified-Since"] = source.lastModified;

  let response;
  try {
    response = await safeFetch(source.feedUrl, {
      headers,
      timeoutMs: FETCH_TIMEOUT_MS,
      maxBytes: MAX_FEED_BYTES,
    });
  } catch (error) {
    const reason =
      error instanceof SsrfBlockedError
        ? `Blocked: ${error.message}`
        : error instanceof Error
          ? error.message
          : "Fetch failed";
    return { ...empty, error: reason };
  }

  if (response.statusCode === 304) {
    return {
      ok: true,
      notModified: true,
      items: [],
      etag: source.etag ?? null,
      lastModified: source.lastModified ?? null,
      error: null,
    };
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    return { ...empty, error: `HTTP ${response.statusCode}` };
  }

  const body = response.body.toString("utf-8");
  const items = parseFeed(body, { baseUrl: source.feedUrl });

  if (items.length === 0) {
    return { ...empty, error: "Feed contained no usable items" };
  }

  const etagHeader = response.headers.etag;
  const lastModifiedHeader = response.headers["last-modified"];

  return {
    ok: true,
    notModified: false,
    items,
    etag: typeof etagHeader === "string" ? etagHeader : null,
    lastModified: typeof lastModifiedHeader === "string" ? lastModifiedHeader : null,
    error: null,
  };
}

export async function recordSourceSuccess(
  db: PrismaClient,
  sourceId: string,
  params: { etag: string | null; lastModified: string | null; itemsIngested: number; now: Date }
): Promise<void> {
  await db.newsSource.update({
    where: { id: sourceId },
    data: {
      status: "HEALTHY",
      consecutiveFailures: 0,
      backoffUntil: null,
      lastError: null,
      lastFetchedAt: params.now,
      lastSuccessAt: params.now,
      etag: params.etag,
      lastModified: params.lastModified,
      itemsIngested: { increment: params.itemsIngested },
    },
  });
}

/*
 * Failures a source will never recover from by being retried.
 *
 * Everything else - a 5xx, a timeout, a connection reset - is a bad
 * moment, and exponential backoff is the right answer. These two are
 * not: a 404 or a 410 means the feed is gone, and a robots.txt
 * disallow is the publisher's decision, not a fault.
 *
 * Retrying them forever is worse than pointless. A dead source that
 * stays enabled makes a category look covered when it is not: found in
 * production, where swissinfo-eng had returned HTTP 404 seven times in
 * a row and was still switched on as one of Switzerland's sources, and
 * cbc-top-stories was still being polled seven failures after the
 * publisher disallowed it.
 */
function isPermanentFailure(error: string): boolean {
  const text = error.toLowerCase();
  return (
    text.startsWith("http 404") ||
    text.startsWith("http 410") ||
    text.includes("disallowed by robots.txt")
  );
}

export async function recordSourceFailure(
  db: PrismaClient,
  source: Pick<NewsSource, "id" | "consecutiveFailures">,
  error: string,
  now: Date
): Promise<void> {
  const failures = source.consecutiveFailures + 1;
  const backoffUntil = new Date(now.getTime() + backoffMinutesFor(failures) * 60 * 1000);

  // Retired rather than retried. The error is kept so the dashboard can
  // still say exactly why, and an admin can re-enable it after fixing
  // the URL.
  const permanent = isPermanentFailure(error);

  await db.newsSource.update({
    where: { id: source.id },
    data: {
      consecutiveFailures: failures,
      ...(permanent ? { enabled: false, status: "DISABLED" as const } : { status: sourceStatusFor(failures) }),
      // Truncated: a source that returns a huge error body must not be
      // able to bloat the row it is reported in.
      lastError: error.slice(0, 500),
      lastErrorAt: now,
      lastFetchedAt: now,
      backoffUntil,
    },
  });
}

/**
 * In-memory index of recent stories, built once per cycle so
 * duplicate detection is a memory comparison rather than a query per
 * ingested item.
 */
export interface StoryIndexEntry {
  id: string;
  title: string;
  fingerprint: string;
}

export class StoryIndex {
  private byFingerprint = new Map<string, StoryIndexEntry>();
  private entries: StoryIndexEntry[] = [];

  constructor(stories: StoryIndexEntry[] = []) {
    stories.forEach((story) => this.add(story));
  }

  add(story: StoryIndexEntry): void {
    if (this.byFingerprint.has(story.fingerprint)) return;
    this.byFingerprint.set(story.fingerprint, story);
    this.entries.push(story);
  }

  match(title: string, itemFingerprint: string): StoryIndexEntry | null {
    const exact = this.byFingerprint.get(itemFingerprint);
    if (exact) return exact;
    const fuzzy = findDuplicate(title, this.entries);
    return fuzzy ? fuzzy.match : null;
  }

  get size(): number {
    return this.entries.length;
  }
}

export interface IngestItemResult {
  outcome: "created" | "merged" | "duplicate" | "skipped";
  storyId: string | null;
}

/**
 * Which topic an ingested item belongs to.
 *
 * A source whose remit is exactly one topic - CoinDesk, Cointelegraph
 * and Decrypt all declare `topics: ["CRYPTO"]` and cover nothing else;
 * the five gaming blogs and NASA/ESA are the same shape - IS the ground
 * truth for what its own items are about. That is not a fabrication:
 * region and country already come straight from the source rather than
 * being re-derived from the text (see classify.ts), for exactly the
 * same reason. Generic keyword classification exists for a source that
 * covers many things (BBC World, UN News), not one that covers one.
 *
 * Real bug this caught: a Cointelegraph headline like "Ethereum staking
 * yields fall as validators grow" or a PlayStation Blog post like
 * "Astro Bot receives a new Photo Mode update" contains none of the
 * generic topic keywords and was silently classified WORLD - sent to a
 * desk that would never publish it as crypto or gaming news at all.
 * Crypto has zero general-news fallback sources (see the comment on
 * the crypto sources below), so every item it loses this way is a
 * story the category never gets back.
 *
 * A source covering more than one topic (UN News: WORLD, POLITICS,
 * HEALTH, ENVIRONMENT; WHO: HEALTH, SCIENCE) still needs classification
 * to pick among its own topics, so this only short-circuits the
 * unambiguous single-topic case.
 */
export function topicFor(source: Pick<NewsSource, "topics">, item: Pick<RawFeedItem, "title" | "summary">) {
  if (source.topics.length === 1) return source.topics[0];
  return classifyTopic(item.title, item.summary);
}

/**
 * Turns one feed item into either a new story or an extra attribution
 * on an existing one.
 *
 * Any failure is reported as "skipped" rather than thrown: an item we
 * cannot safely place is an item we do not publish. In particular, if
 * duplicate detection itself errors, the item is dropped - failing
 * closed, because the alternative is flooding the feed.
 */
export async function ingestItem(
  db: PrismaClient,
  source: NewsSource,
  item: RawFeedItem,
  index: StoryIndex,
  now: Date
): Promise<IngestItemResult> {
  try {
    // The unique constraint on NewsStorySource.url is the real
    // idempotency guarantee; this is just the cheap path.
    const existingReference = await db.newsStorySource.findUnique({
      where: { url: item.link },
      select: { storyId: true },
    });
    if (existingReference) {
      return { outcome: "duplicate", storyId: existingReference.storyId };
    }

    const itemFingerprint = fingerprint(item.title);
    const match = index.match(item.title, itemFingerprint);

    const publishedAt = item.publishedAt ?? now;

    // Only reference a source's preview image when that source has been
    // explicitly marked as permitting reuse. Default is off: an image
    // whose licence we have not confirmed is simply not used, and the
    // post publishes as text plus source link.
    const imageUrl =
      source.allowImages && item.imageUrl && /^https:\/\//i.test(item.imageUrl)
        ? item.imageUrl
        : null;

    if (match) {
      const story = await db.newsStory.findUnique({
        where: { id: match.id },
        include: { references: { include: { source: true } } },
      });

      // The story was removed between index build and now.
      if (!story) return { outcome: "skipped", storyId: null };

      await db.newsStorySource.create({
        data: {
          storyId: story.id,
          sourceId: source.id,
          url: item.link,
          title: item.title,
          excerpt: item.summary,
          imageUrl,
          publishedAt,
        },
      });

      const sourceCount = story.references.length + 1;
      const bestTrustTier = Math.min(
        source.trustTier,
        ...story.references.map((reference) => reference.source.trustTier)
      );

      const confidence = assessConfidence({
        sourceCount,
        bestTrustTier,
        titles: [story.title, ...story.references.map((reference) => reference.title), item.title],
        summaries: [
          ...story.references.map((reference) => reference.excerpt),
          item.summary,
        ],
      });

      const importance = scoreStory({
        sourceCount,
        bestTrustTier,
        confidence,
        isBreaking: story.isBreaking,
        topic: story.topic,
        firstSeenAt: story.firstSeenAt,
        now,
      });

      await db.newsStory.update({
        where: { id: story.id },
        data: {
          sourceCount,
          confidence,
          importance,
          lastSeenAt: now,
          // Keep the first usable image; never overwrite one we already
          // cleared for use with a later, unvetted one.
          imageUrl: story.imageUrl ?? imageUrl,
          imageCredit: story.imageCredit ?? (imageUrl ? source.publisher : null),
          sourceMaterial: appendSourceMaterial(story.sourceMaterial, source.publisher, item),
        },
      });

      return { outcome: "merged", storyId: story.id };
    }

    const topic = topicFor(source, item);
    const isBreaking = detectBreaking(item.title, item.summary);
    const sensitive = detectSensitive(item.title, item.summary);

    const confidence = assessConfidence({
      sourceCount: 1,
      bestTrustTier: source.trustTier,
      titles: [item.title],
      summaries: [item.summary],
    });

    const importance = scoreStory({
      sourceCount: 1,
      bestTrustTier: source.trustTier,
      confidence,
      isBreaking,
      topic,
      firstSeenAt: publishedAt,
      now,
    });

    const story = await db.newsStory.create({
      data: {
        fingerprint: itemFingerprint,
        normalizedTitle: normalizeTitle(item.title),
        title: item.title,
        sourceMaterial: buildSourceMaterial(source.publisher, item),
        topic,
        region: source.region,
        country: source.country,
        language: source.language,
        confidence,
        sensitive,
        isBreaking,
        isTravel: isTravelTopic(topic),
        importance,
        sourceCount: 1,
        imageUrl,
        imageCredit: imageUrl ? source.publisher : null,
        firstSeenAt: publishedAt,
        lastSeenAt: now,
        references: {
          create: {
            sourceId: source.id,
            url: item.link,
            title: item.title,
            excerpt: item.summary,
            imageUrl,
            publishedAt,
          },
        },
      },
    });

    index.add({ id: story.id, title: story.title, fingerprint: story.fingerprint });

    return { outcome: "created", storyId: story.id };
  } catch (error) {
    // A unique-constraint violation here means a concurrent run won the
    // race - which is duplicate detection working, not a failure.
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Unique constraint")) {
      return { outcome: "duplicate", storyId: null };
    }
    console.error("ZRP News: failed to ingest item", item.link, error);
    return { outcome: "skipped", storyId: null };
  }
}

/**
 * The verbatim material handed to the summariser. Deliberately built
 * from headline + the publisher's own short abstract only, attributed
 * per source, and hard-capped: the model must have real facts to work
 * from and nothing resembling a full article to copy.
 */
export function buildSourceMaterial(publisher: string, item: RawFeedItem): string {
  const parts = [`[${publisher}] ${item.title}`];
  if (item.summary) parts.push(item.summary);
  return parts.join("\n").slice(0, 900);
}

export function appendSourceMaterial(
  existing: string,
  publisher: string,
  item: RawFeedItem
): string {
  const addition = buildSourceMaterial(publisher, item);
  if (existing.includes(addition)) return existing;
  // 3000 characters holds material from roughly four sources - enough
  // corroboration for the summariser, still nowhere near article length.
  return `${existing}\n---\n${addition}`.slice(0, 3000);
}

/** Loads the recent-story window used for duplicate detection. */
export async function buildStoryIndex(
  db: PrismaClient,
  now: Date,
  windowHours = 48
): Promise<StoryIndex> {
  const since = new Date(now.getTime() - windowHours * 60 * 60 * 1000);
  const stories = await db.newsStory.findMany({
    where: { lastSeenAt: { gte: since } },
    select: { id: true, title: true, fingerprint: true },
    orderBy: { lastSeenAt: "desc" },
    take: 2000,
  });
  return new StoryIndex(stories);
}

export interface SourceIngestSummary {
  sourceId: string;
  ok: boolean;
  notModified: boolean;
  created: number;
  merged: number;
  duplicates: number;
  skipped: number;
  error: string | null;
}

/** Polls one source and files everything it returned. */
export async function ingestSource(
  source: NewsSource,
  index: StoryIndex,
  now: Date,
  db: PrismaClient = prisma
): Promise<SourceIngestSummary> {
  const summary: SourceIngestSummary = {
    sourceId: source.id,
    ok: false,
    notModified: false,
    created: 0,
    merged: 0,
    duplicates: 0,
    skipped: 0,
    error: null,
  };

  const outcome = await fetchSource(source);

  if (!outcome.ok) {
    summary.error = outcome.error ?? "Unknown fetch failure";
    await recordSourceFailure(db, source, summary.error, now);
    return summary;
  }

  summary.ok = true;

  if (outcome.notModified) {
    summary.notModified = true;
    await recordSourceSuccess(db, source.id, {
      etag: outcome.etag,
      lastModified: outcome.lastModified,
      itemsIngested: 0,
      now,
    });
    return summary;
  }

  for (const item of outcome.items) {
    const result = await ingestItem(db, source, item, index, now);
    if (result.outcome === "created") summary.created += 1;
    else if (result.outcome === "merged") summary.merged += 1;
    else if (result.outcome === "duplicate") summary.duplicates += 1;
    else summary.skipped += 1;
  }

  await recordSourceSuccess(db, source.id, {
    etag: outcome.etag,
    lastModified: outcome.lastModified,
    itemsIngested: summary.created + summary.merged,
    now,
  });

  return summary;
}

/** Marks stories too old to publish as superseded so they stop ranking. */
export async function expireStaleStories(
  db: PrismaClient,
  now: Date,
  maxAgeHours: number
): Promise<number> {
  const cutoff = new Date(now.getTime() - maxAgeHours * 60 * 60 * 1000);
  const result = await db.newsStory.updateMany({
    where: { status: { in: ["NEW", "READY"] }, firstSeenAt: { lt: cutoff } },
    data: { status: "SUPERSEDED" },
  });
  return result.count;
}

