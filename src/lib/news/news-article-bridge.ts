import type { NewsArticleCategory, NewsRegion, NewsTopic, Prisma } from "@prisma/client";

/*
 * ============================================================
 * Bridge into the pre-existing /news landing page
 * ============================================================
 *
 * /news and /api/news are a separate, pre-existing feature: a
 * NewsArticle table with its own human-journalist DRAFT -> submitted
 * -> reviewed -> PUBLISHED workflow, unrelated to the News Network's
 * own Post/NewsPublication pipeline. The News Network was never wired
 * into it - this bridges the two, without touching the journalist
 * workflow at all: every row created here goes straight to PUBLISHED,
 * exactly like the ordinary Post the same publication already creates.
 */

/**
 * Maps a story's topic/region/country onto NewsArticleCategory, the
 * pre-existing human-authored category enum /news filters by (which
 * has no equivalent of every NewsTopic value). Country decides first
 * (Switzerland is its own category there), then topic, then region,
 * defaulting to WORLD.
 */
export function mapToArticleCategory(story: {
  topic: NewsTopic;
  region: NewsRegion;
  country: string | null;
}): NewsArticleCategory {
  if (story.country === "CH") return "SWITZERLAND";

  const byTopic: Partial<Record<NewsTopic, NewsArticleCategory>> = {
    POLITICS: "POLITICS",
    BUSINESS: "BUSINESS",
    ECONOMY: "BUSINESS",
    FINANCE: "BUSINESS",
    TECHNOLOGY: "TECHNOLOGY",
    AI: "TECHNOLOGY",
    CRYPTO: "CRYPTO",
    SCIENCE: "SCIENCE",
    HEALTH: "SCIENCE",
    ENVIRONMENT: "SCIENCE",
    CLIMATE: "SCIENCE",
    SPORTS: "SPORTS",
    ENTERTAINMENT: "CULTURE",
    CULTURE: "CULTURE",
    LIFESTYLE: "CULTURE",
    GAMING: "GAMING",
  };

  const mapped = byTopic[story.topic];
  if (mapped) return mapped;
  if (story.region === "EUROPE") return "EUROPE";
  return "WORLD";
}

// Combining diacritical marks (U+0300-U+036F) left behind by NFKD
// normalization, e.g. decomposing "é" into "e" + a combining acute
// accent - stripped so the accent doesn't turn into a stray "-".
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * Slug for the /news landing page. Deterministic from the story id
 * (never random), so re-deriving it for the same story always gives
 * the same slug rather than minting a new one on every retry.
 */
export function slugForStory(headline: string, storyId: string): string {
  const base = headline
    .toLowerCase()
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  const suffix = storyId.slice(-8);
  return base ? `${base}-${suffix}` : suffix;
}

/**
 * Creates the /news-facing article for a story's first publication,
 * in whichever language reaches this first - one row per real-world
 * story, not one per language rendition, since NewsArticle has no
 * language field and the page has no language switch.
 *
 * `sourceUrl` is the idempotency check: NewsStorySource.url is unique
 * per story, so a second publication of the same story (a different
 * language, or a retried cycle) is a no-op here, exactly like
 * reservePublication's own idempotency key stops a duplicate Post.
 */
export async function maybeCreateNewsArticle(
  tx: Prisma.TransactionClient,
  params: {
    storyId: string;
    topic: NewsTopic;
    region: NewsRegion;
    country: string | null;
    isBreaking: boolean;
    headline: string;
    body: string;
    imageUrl: string | null;
    sourceName: string;
    sourceUrl: string;
    authorId: string;
    now: Date;
  }
): Promise<void> {
  const existing = await tx.newsArticle.findFirst({
    where: { sourceUrl: params.sourceUrl },
    select: { id: true },
  });
  if (existing) return;

  await tx.newsArticle.create({
    data: {
      title: params.headline,
      slug: slugForStory(params.headline, params.storyId),
      excerpt: params.body.slice(0, 240),
      content: params.body,
      coverImage: params.imageUrl,
      sourceName: params.sourceName,
      sourceUrl: params.sourceUrl,
      category: mapToArticleCategory(params),
      status: "PUBLISHED",
      authorId: params.authorId,
      featured: params.isBreaking,
      publishedAt: params.now,
    },
  });
}

const CORRECTION_MARKER = "\n\nCORRECTION: ";

/**
 * Mirrors a correction onto the story's NewsArticle, if one exists.
 *
 * Reads the article's own stored content rather than taking it from
 * the caller, since one NewsArticle can trail publications in several
 * languages (see maybeCreateNewsArticle) and there is no single
 * "the" body to hand in. Any previously-appended correction is
 * stripped before the new one is added - same "latest correction
 * replaces the last one, not accumulates" behaviour as the Post's own
 * composePostContent (see format.ts) - so re-correcting twice leaves
 * one correction note, not two stacked.
 */
export async function correctNewsArticle(
  tx: Prisma.TransactionClient,
  sourceUrl: string,
  correctionNote: string
): Promise<void> {
  const article = await tx.newsArticle.findFirst({
    where: { sourceUrl },
    select: { id: true, content: true },
  });
  if (!article) return;

  const base = article.content.split(CORRECTION_MARKER)[0];

  await tx.newsArticle.update({
    where: { id: article.id },
    data: { content: `${base}${CORRECTION_MARKER}${correctionNote}` },
  });
}

/** Removes the story's NewsArticle, if one exists - mirrors the Post's own hard delete on takedown. */
export async function removeNewsArticle(tx: Prisma.TransactionClient, sourceUrl: string): Promise<void> {
  await tx.newsArticle.deleteMany({ where: { sourceUrl } });
}
