import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { textMatchWeight } from "../text-match";
import { relevanceScore, ageDecayedScore } from "../ranking";
import { buildKeysetPage, paginateRanked, parseOffsetCursor } from "../paginate";
import { CANDIDATE_POOL_SIZE, RANKED_CACHE_TTL_SECONDS } from "../constants";
import { resolveDateFilter } from "../params";
import type { SearchPage, SearchQueryParams } from "../types";

// ─── Marketplace: luxury listings ─────────────────────────────────────
// Mirrors GET /api/listings' own public-browse visibility rule exactly:
// status ACTIVE and not expired (Listing.expiresAt - "expired listings
// stop showing in browse/search but aren't deleted", per that model's
// own schema comment - honored here rather than reinvented). country/
// language/verified/professional/creator filter on the SELLER.

const SELLER_SELECT = {
  id: true,
  username: true,
  name: true,
  avatarUrl: true,
  badgeType: true,
  isPrivate: true,
} satisfies Prisma.UserSelect;

const SELECT = {
  id: true,
  category: true,
  title: true,
  description: true,
  price: true,
  currency: true,
  priceOnRequest: true,
  location: true,
  imageUrls: true,
  videoUrl: true,
  views: true,
  createdAt: true,
  seller: { select: SELLER_SELECT },
} satisfies Prisma.ListingSelect;

export type MarketplaceSearchResult = Prisma.ListingGetPayload<{ select: typeof SELECT }>;

function buildWhere(params: SearchQueryParams): Prisma.ListingWhereInput {
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
          { location: { contains: query, mode: "insensitive" } },
        ],
      },
      // Same banned-author gap already fixed for the Posts category
      // (src/lib/search/categories/posts.ts) - a banned seller's still-
      // ACTIVE listing must not be findable through search.
      { seller: { banned: false } },
      ...(dateFilter ? [{ createdAt: dateFilter }] : []),
      ...(filters.verified ? [{ seller: { badgeType: { not: null } } }] : []),
      ...(filters.professional
        ? [{ seller: { OR: [{ headline: { not: null } }, { company: { not: null } }] } } as Prisma.ListingWhereInput]
        : []),
      ...(filters.creator ? [{ seller: { creatorProfile: { isNot: null } } }] : []),
      ...(filters.country ? [{ seller: { countryCode: filters.country } }] : []),
      ...(filters.language ? [{ seller: { languageCode: filters.language } }] : []),
    ],
  };
}

function scoreCandidate(l: MarketplaceSearchResult, query: string, sort: SearchQueryParams["sort"]): number {
  if (sort === "engagement") return l.views;
  if (sort === "trending") return ageDecayedScore(l.views, l.createdAt);
  return relevanceScore(textMatchWeight(query, l.title, l.description, l.location), l.views);
}

export async function searchMarketplace(params: SearchQueryParams): Promise<SearchPage<MarketplaceSearchResult>> {
  if (params.query.trim().length < 2) return { items: [], nextCursor: null };
  const where = buildWhere(params);

  if (params.sort === "recent") {
    const rows = await prisma.listing.findMany({
      where,
      select: SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
    return buildKeysetPage(rows, params.limit);
  }

  const offset = parseOffsetCursor(params.cursor);
  const cacheKey = `search:marketplace:v1:${params.sort}:${params.query.trim().toLowerCase()}:${JSON.stringify(
    params.filters
  )}`;

  return paginateRanked<MarketplaceSearchResult>(cacheKey, RANKED_CACHE_TTL_SECONDS, offset, params.limit, async () => {
    const candidates = await prisma.listing.findMany({
      where,
      select: SELECT,
      orderBy: { createdAt: "desc" },
      take: CANDIDATE_POOL_SIZE,
    });
    return candidates
      .map((l) => ({ l, score: scoreCandidate(l, params.query, params.sort) }))
      .sort((a, b) => b.score - a.score)
      .map((r) => r.l);
  });
}
