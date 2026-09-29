import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { textMatchWeight } from "../text-match";
import { relevanceScore, ageDecayedScore } from "../ranking";
import { buildKeysetPage, paginateRanked, parseOffsetCursor } from "../paginate";
import { CANDIDATE_POOL_SIZE, RANKED_CACHE_TTL_SECONDS } from "../constants";
import { resolveDateFilter } from "../params";
import type { SearchPage, SearchQueryParams } from "../types";

// ─── Opportunities: jobs/internships/scholarships/freelance/... ──────
// Mirrors GET /api/opportunity's own public-browse visibility rule
// exactly: status ACTIVE and not expired (see prisma/schema.prisma's
// own comment on OpportunityListing - PENDING_REVIEW/REJECTED/CLOSED/
// REMOVED must never appear in search, matching the existing browse
// route rather than inventing a second visibility rule). country/
// language/verified/professional/creator filter on the POSTER, the same
// pattern Posts uses for its author.

const POSTER_SELECT = {
  id: true,
  username: true,
  name: true,
  avatarUrl: true,
  badgeType: true,
} satisfies Prisma.UserSelect;

const SELECT = {
  id: true,
  type: true,
  title: true,
  description: true,
  organizationName: true,
  skills: true,
  location: true,
  remote: true,
  isPaid: true,
  compensationInfo: true,
  externalUrl: true,
  deadline: true,
  views: true,
  createdAt: true,
  poster: { select: POSTER_SELECT },
} satisfies Prisma.OpportunityListingSelect;

export type OpportunitySearchResult = Prisma.OpportunityListingGetPayload<{ select: typeof SELECT }>;

function buildWhere(params: SearchQueryParams): Prisma.OpportunityListingWhereInput {
  const { query, filters } = params;
  const dateFilter = resolveDateFilter(filters);
  return {
    AND: [
      { status: "ACTIVE" },
      { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      {
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
          { organizationName: { contains: query, mode: "insensitive" } },
          { skills: { has: query.toLowerCase() } },
        ],
      },
      ...(dateFilter ? [{ createdAt: dateFilter }] : []),
      ...(filters.verified ? [{ poster: { badgeType: { not: null } } }] : []),
      ...(filters.professional
        ? [{ poster: { OR: [{ headline: { not: null } }, { company: { not: null } }] } } as Prisma.OpportunityListingWhereInput]
        : []),
      ...(filters.creator ? [{ poster: { creatorProfile: { isNot: null } } }] : []),
      ...(filters.country ? [{ poster: { countryCode: filters.country } }] : []),
      ...(filters.language ? [{ poster: { languageCode: filters.language } }] : []),
    ],
  };
}

function scoreCandidate(o: OpportunitySearchResult, query: string, sort: SearchQueryParams["sort"]): number {
  if (sort === "engagement") return o.views;
  if (sort === "trending") return ageDecayedScore(o.views, o.createdAt);
  return relevanceScore(textMatchWeight(query, o.title, o.description, o.organizationName, ...o.skills), o.views);
}

export async function searchOpportunities(params: SearchQueryParams): Promise<SearchPage<OpportunitySearchResult>> {
  if (params.query.trim().length < 2) return { items: [], nextCursor: null };
  const where = buildWhere(params);

  if (params.sort === "recent") {
    const rows = await prisma.opportunityListing.findMany({
      where,
      select: SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
    return buildKeysetPage(rows, params.limit);
  }

  const offset = parseOffsetCursor(params.cursor);
  const cacheKey = `search:opportunities:v1:${params.sort}:${params.query.trim().toLowerCase()}:${JSON.stringify(
    params.filters
  )}`;

  return paginateRanked<OpportunitySearchResult>(cacheKey, RANKED_CACHE_TTL_SECONDS, offset, params.limit, async () => {
    const candidates = await prisma.opportunityListing.findMany({
      where,
      select: SELECT,
      orderBy: { createdAt: "desc" },
      take: CANDIDATE_POOL_SIZE,
    });
    return candidates
      .map((o) => ({ o, score: scoreCandidate(o, params.query, params.sort) }))
      .sort((a, b) => b.score - a.score)
      .map((r) => r.o);
  });
}
