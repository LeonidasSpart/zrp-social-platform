import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { textMatchWeight } from "../text-match";
import { relevanceScore, ageDecayedScore } from "../ranking";
import { buildKeysetPage, paginateRanked, parseOffsetCursor } from "../paginate";
import { CANDIDATE_POOL_SIZE, RANKED_CACHE_TTL_SECONDS } from "../constants";
import { resolveDateFilter } from "../params";
import type { SearchPage, SearchQueryParams } from "../types";

// ─── Communities: name / description / topics / hashtag ──────────────
// Communities have no privacy model (see prisma/schema.prisma - every
// Community is publicly visible; CommunityMember only gates
// membership/role, not read access), so there is no viewer-scoped
// security filter here beyond the ordinary query match. language/
// country/verified/professional/creator filters don't apply to a
// Community and are ignored for this category (documented in
// docs/advanced-search-architecture.md), matching the brief's own "only
// where real ZRP entities exist" instruction rather than fabricating a
// meaning for them.

const SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  category: true,
  hashtag: true,
  iconUrl: true,
  memberCount: true,
  createdAt: true,
} satisfies Prisma.CommunitySelect;

export type CommunitySearchResult = Prisma.CommunityGetPayload<{ select: typeof SELECT }>;

function buildWhere(params: SearchQueryParams): Prisma.CommunityWhereInput {
  const dateFilter = resolveDateFilter(params.filters);
  return {
    AND: [
      {
        OR: [
          { name: { contains: params.query, mode: "insensitive" } },
          { description: { contains: params.query, mode: "insensitive" } },
          { hashtag: { contains: params.query.replace(/^#/, ""), mode: "insensitive" } },
        ],
      },
      ...(dateFilter ? [{ createdAt: dateFilter }] : []),
    ],
  };
}

function scoreCandidate(c: CommunitySearchResult, query: string, sort: SearchQueryParams["sort"]): number {
  if (sort === "engagement") return c.memberCount;
  if (sort === "trending") return ageDecayedScore(c.memberCount, c.createdAt);
  return relevanceScore(textMatchWeight(query, c.name, c.description, c.hashtag), c.memberCount);
}

export async function searchCommunities(params: SearchQueryParams): Promise<SearchPage<CommunitySearchResult>> {
  if (params.query.trim().length < 2) return { items: [], nextCursor: null };
  const where = buildWhere(params);

  if (params.sort === "recent") {
    const rows = await prisma.community.findMany({
      where,
      select: SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
    return buildKeysetPage(rows, params.limit);
  }

  const offset = parseOffsetCursor(params.cursor);
  const cacheKey = `search:communities:v1:${params.sort}:${params.query.trim().toLowerCase()}:${JSON.stringify(
    params.filters
  )}`;

  return paginateRanked<CommunitySearchResult>(cacheKey, RANKED_CACHE_TTL_SECONDS, offset, params.limit, async () => {
    const candidates = await prisma.community.findMany({
      where,
      select: SELECT,
      orderBy: { createdAt: "desc" },
      take: CANDIDATE_POOL_SIZE,
    });
    return candidates
      .map((c) => ({ c, score: scoreCandidate(c, params.query, params.sort) }))
      .sort((a, b) => b.score - a.score)
      .map((r) => r.c);
  });
}
