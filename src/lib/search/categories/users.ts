import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { textMatchWeight } from "../text-match";
import { relevanceScore, ageDecayedScore } from "../ranking";
import { buildKeysetPage, paginateRanked, parseOffsetCursor } from "../paginate";
import { CANDIDATE_POOL_SIZE, RANKED_CACHE_TTL_SECONDS } from "../constants";
import { resolveDateFilter } from "../params";
import type { SearchPage, SearchQueryParams } from "../types";

// ─── People: username / display name / professional profile ─────────
// "verified" = has any badge at all (VALID_BADGE_TYPES in
// src/app/api/admin/users/[id]/route.ts: verified/organization/
// government/team/journalist) - not narrowed to badgeType === "verified"
// specifically, matching how badgeType is already treated elsewhere as
// a general "notable account" signal (e.g. src/app/aid/page.tsx's own
// isVerifiedOrganizer check). "professional" = has a headline, company
// or position set (src/lib/professionalCategories.ts's `category` field
// is a separate, pre-existing taxonomy, deliberately not treated as
// "professional" on its own - many ordinary accounts set it). "creator"
// = has a CreatorProfile row.

const SELECT = {
  id: true,
  username: true,
  name: true,
  avatarUrl: true,
  badgeType: true,
  headline: true,
  company: true,
  countryCode: true,
  createdAt: true,
  _count: { select: { followers: true } },
} satisfies Prisma.UserSelect;

type Candidate = Prisma.UserGetPayload<{ select: typeof SELECT }>;

export interface UserSearchResult {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  badgeType: string | null;
  headline: string | null;
  company: string | null;
  countryCode: string | null;
  createdAt: Date;
}

function toResult(u: Candidate): UserSearchResult {
  const { _count, ...rest } = u;
  return rest;
}

function buildWhere(params: SearchQueryParams): Prisma.UserWhereInput {
  const { query, filters, excludedAuthorIds } = params;
  const dateFilter = resolveDateFilter(filters);

  return {
    AND: [
      {
        OR: [
          { username: { contains: query, mode: "insensitive" } },
          { name: { contains: query, mode: "insensitive" } },
          { headline: { contains: query, mode: "insensitive" } },
          { company: { contains: query, mode: "insensitive" } },
        ],
      },
      { id: { notIn: excludedAuthorIds } },
      { banned: false },
      ...(filters.verified ? [{ badgeType: { not: null } }] : []),
      ...(filters.professional
        ? [
            {
              OR: [
                { headline: { not: null } },
                { company: { not: null } },
                { position: { not: null } },
              ],
            } as Prisma.UserWhereInput,
          ]
        : []),
      ...(filters.creator ? [{ creatorProfile: { isNot: null } }] : []),
      ...(filters.country ? [{ countryCode: filters.country }] : []),
      ...(filters.language ? [{ languageCode: filters.language }] : []),
      ...(dateFilter ? [{ createdAt: dateFilter }] : []),
    ],
  };
}

function scoreCandidate(u: Candidate, query: string, sort: SearchQueryParams["sort"]): number {
  const followerCount = u._count.followers;
  if (sort === "engagement") return followerCount;
  if (sort === "trending") return ageDecayedScore(followerCount, u.createdAt);
  return relevanceScore(textMatchWeight(query, u.username, u.name, u.headline, u.company), followerCount);
}

export async function searchUsers(params: SearchQueryParams): Promise<SearchPage<UserSearchResult>> {
  if (params.query.trim().length < 2) return { items: [], nextCursor: null };
  const where = buildWhere(params);

  if (params.sort === "recent") {
    const rows = await prisma.user.findMany({
      where,
      select: SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
    const page = buildKeysetPage(rows, params.limit);
    return { items: page.items.map(toResult), nextCursor: page.nextCursor };
  }

  const offset = parseOffsetCursor(params.cursor);
  const cacheKey = `search:users:v1:${params.viewerId || "anon"}:${params.sort}:${params.query
    .trim()
    .toLowerCase()}:${JSON.stringify(params.filters)}`;

  return paginateRanked<UserSearchResult>(cacheKey, RANKED_CACHE_TTL_SECONDS, offset, params.limit, async () => {
    const candidates = await prisma.user.findMany({
      where,
      select: SELECT,
      orderBy: { createdAt: "desc" },
      take: CANDIDATE_POOL_SIZE,
    });
    return candidates
      .map((u) => ({ user: u, score: scoreCandidate(u, params.query, params.sort) }))
      .sort((a, b) => b.score - a.score)
      .map((r) => toResult(r.user));
  });
}
