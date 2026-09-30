import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { textMatchWeight } from "../text-match";
import { relevanceScore, ageDecayedScore } from "../ranking";
import { buildKeysetPage, paginateRanked, parseOffsetCursor } from "../paginate";
import { CANDIDATE_POOL_SIZE, RANKED_CACHE_TTL_SECONDS } from "../constants";
import { resolveDateFilter } from "../params";
import type { SearchPage, SearchQueryParams } from "../types";

// ─── News: journalist-authored NewsArticle, not the ingestion pipeline
// ─────────────────────────────────────────────────────────────────────
// ZRP has two separate "news" systems (see docs/advanced-search-
// architecture.md for the full audit trail): NewsStory/NewsRendition/
// NewsPublication is the AI ingestion pipeline, which PUBLISHES AS
// ORDINARY POSTS via editorial-feed accounts (User.isEditorialFeed) -
// that content is already covered by the Posts category, so surfacing
// NewsStory here too would be duplicate results for the same content.
// NewsArticle is the actual distinct, publicly browsable entity (GET
// /api/news already serves exactly this: status=PUBLISHED,
// publishedAt not null) - this category matches that route's own
// visibility rule exactly, matching its query-param semantics rather
// than reinventing a second one.
//
// NewsArticle has no `language` or `country` column (confirmed against
// prisma/schema.prisma), so those two filters don't apply to this
// category and are ignored here - documented rather than fabricated.

const SELECT = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  coverImage: true,
  sourceName: true,
  category: true,
  views: true,
  featured: true,
  publishedAt: true,
  createdAt: true,
  author: { select: { id: true, username: true, name: true, avatarUrl: true, badgeType: true } },
} satisfies Prisma.NewsArticleSelect;

export type NewsSearchResult = Prisma.NewsArticleGetPayload<{ select: typeof SELECT }>;

function buildWhere(params: SearchQueryParams): Prisma.NewsArticleWhereInput {
  const dateFilter = resolveDateFilter(params.filters);
  return {
    AND: [
      { status: "PUBLISHED", publishedAt: { not: null } },
      {
        OR: [
          { title: { contains: params.query, mode: "insensitive" } },
          { excerpt: { contains: params.query, mode: "insensitive" } },
          { content: { contains: params.query, mode: "insensitive" } },
          { sourceName: { contains: params.query, mode: "insensitive" } },
        ],
      },
      // Same banned-author gap already fixed for the Posts category
      // (src/lib/search/categories/posts.ts) - a journalist banned
      // after publishing must not keep surfacing through search.
      { author: { banned: false } },
      ...(dateFilter ? [{ publishedAt: dateFilter }] : []),
    ],
  };
}

function scoreCandidate(a: NewsSearchResult, query: string, sort: SearchQueryParams["sort"]): number {
  if (sort === "engagement") return a.views;
  if (sort === "trending") return ageDecayedScore(a.views, a.publishedAt ?? a.createdAt);
  return relevanceScore(textMatchWeight(query, a.title, a.excerpt, a.sourceName), a.views);
}

export async function searchNews(params: SearchQueryParams): Promise<SearchPage<NewsSearchResult>> {
  if (params.query.trim().length < 2) return { items: [], nextCursor: null };
  const where = buildWhere(params);

  if (params.sort === "recent") {
    const rows = await prisma.newsArticle.findMany({
      where,
      select: SELECT,
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
    return buildKeysetPage(rows, params.limit);
  }

  const offset = parseOffsetCursor(params.cursor);
  const cacheKey = `search:news:v1:${params.sort}:${params.query.trim().toLowerCase()}:${JSON.stringify(params.filters)}`;

  return paginateRanked<NewsSearchResult>(cacheKey, RANKED_CACHE_TTL_SECONDS, offset, params.limit, async () => {
    const candidates = await prisma.newsArticle.findMany({
      where,
      select: SELECT,
      orderBy: { publishedAt: "desc" },
      take: CANDIDATE_POOL_SIZE,
    });
    return candidates
      .map((a) => ({ a, score: scoreCandidate(a, params.query, params.sort) }))
      .sort((a, b) => b.score - a.score)
      .map((r) => r.a);
  });
}
