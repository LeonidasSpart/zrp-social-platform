import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { viewablePostAuthorFilter } from "@/lib/permissions";
import { applyPremiumGating, Gated } from "@/lib/premium-content";
import {
  calculateScore,
  calculateTrendingScore,
  calculatePostEngagement,
  TRENDING_WINDOW_HOURS,
} from "@/lib/feed/scoring";
import { textMatchWeight } from "../text-match";
import { relevanceScore } from "../ranking";
import { buildKeysetPage, paginateRanked, parseOffsetCursor } from "../paginate";
import { CANDIDATE_POOL_SIZE, RANKED_CACHE_TTL_SECONDS } from "../constants";
import { resolveDateFilter } from "../params";
import type { SearchPage, SearchQueryParams } from "../types";

// ─── Posts: content / hashtags / mentions / media / articles / polls ─
// Post has no `language` column (confirmed against prisma/schema.prisma
// - unlike NewsArticle it was never given one) so the `language` filter
// here honestly keys off the AUTHOR's languageCode rather than
// fabricating a field that doesn't exist. "verified"/"professional"/
// "creator" likewise describe the author, not the post itself.
// `community` scopes results to one Community's hashtag (Community.
// hashtag - see prisma/schema.prisma's own comment: "the single hashtag
// whose posts make up this community's feed").

const AUTHOR_SELECT = {
  id: true,
  username: true,
  name: true,
  avatarUrl: true,
  badgeType: true,
  countryCode: true,
  languageCode: true,
  headline: true,
  company: true,
} satisfies Prisma.UserSelect;

const SELECT = {
  id: true,
  content: true,
  imageUrl: true,
  imageUrls: true,
  mediaType: true,
  createdAt: true,
  views: true,
  isPoll: true,
  hashtags: true,
  type: true,
  authorId: true,
  poll: {
    select: { id: true, question: true, options: true, votes: true, expiresAt: true },
  },
  author: { select: AUTHOR_SELECT },
  quotePost: {
    select: {
      id: true,
      authorId: true,
      content: true,
      imageUrl: true,
      imageUrls: true,
      mediaType: true,
      createdAt: true,
      author: { select: AUTHOR_SELECT },
      _count: { select: { likes: true, comments: true, reposts: true, quotedBy: true } },
    },
  },
  _count: { select: { likes: true, comments: true, reposts: true, quotedBy: true } },
} satisfies Prisma.PostSelect;

type Candidate = Prisma.PostGetPayload<{ select: typeof SELECT }>;

/**
 * Attaches the viewer's own poll vote (`votes_user`, the same raw shape
 * every other poll-reading route already returns) fresh per request -
 * never baked into the cached ranked candidate list, for the identical
 * reason GET /api/posts/explore hydrates it post-cache: a vote cast
 * after the list is cached must show up immediately, and the cache
 * entry itself is never viewer-vote-specific even though it's already
 * keyed per viewer for the block/mute-exclusion reason above.
 */
async function hydratePollVotes<T extends { poll: { id: string; votes: unknown } | null }>(
  items: T[],
  viewerId: string | null
): Promise<(T & { poll: (T["poll"] & { votes_user: { optionIndex: number }[] }) | null })[]> {
  const pollIds = items.filter((p) => p.poll).map((p) => p.poll!.id);
  const votesByPoll = new Map<string, number>();
  if (viewerId && pollIds.length > 0) {
    const votes = await prisma.pollVote.findMany({
      where: { userId: viewerId, pollId: { in: pollIds } },
      select: { pollId: true, optionIndex: true },
    });
    for (const v of votes) votesByPoll.set(v.pollId, v.optionIndex);
  }
  return items.map((p) => ({
    ...p,
    poll: p.poll
      ? { ...p.poll, votes_user: votesByPoll.has(p.poll.id) ? [{ optionIndex: votesByPoll.get(p.poll.id)! }] : [] }
      : null,
  }));
}

function mediaWhere(media: SearchQueryParams["filters"]["media"]): Prisma.PostWhereInput | null {
  switch (media) {
    case "image":
      return { OR: [{ mediaType: "image" }, { imageUrl: { not: null } }, { NOT: { imageUrls: { isEmpty: true } } }] };
    case "video":
      return { mediaType: "video" };
    case "gif":
      return { mediaType: "gif" };
    case "poll":
      return { isPoll: true };
    case "none":
      return { imageUrl: null, mediaType: null, isPoll: false, imageUrls: { isEmpty: true } };
    default:
      return null;
  }
}

async function buildWhere(params: SearchQueryParams): Promise<Prisma.PostWhereInput> {
  const { query, filters, excludedAuthorIds } = params;
  const dateFilter = resolveDateFilter(filters);
  const media = mediaWhere(filters.media);

  let communityHashtag: string | null = null;
  if (filters.community) {
    const community = await prisma.community.findUnique({
      where: { slug: filters.community },
      select: { hashtag: true },
    });
    // An unknown community slug must never silently fall back to
    // "no community filter" (that would return everyone's posts under
    // a viewer's mistaken belief they're scoped to one community) - it
    // resolves to a filter that matches nothing instead.
    communityHashtag = community?.hashtag ?? "__no_such_community__";
  }

  return {
    AND: [
      {
        OR: [
          { content: { contains: query, mode: "insensitive" } },
          { hashtags: { has: query.toLowerCase().replace(/^#/, "") } },
        ],
      },
      { authorId: { notIn: excludedAuthorIds } },
      { status: "published" },
      { scheduledAt: null },
      { author: viewablePostAuthorFilter(params.viewerId) },
      ...(media ? [media] : []),
      ...(dateFilter ? [{ createdAt: dateFilter }] : []),
      ...(communityHashtag ? [{ hashtags: { has: communityHashtag } }] : []),
      ...(filters.verified ? [{ author: { badgeType: { not: null } } }] : []),
      ...(filters.professional
        ? [
            {
              author: {
                OR: [{ headline: { not: null } }, { company: { not: null } }],
              },
            } as Prisma.PostWhereInput,
          ]
        : []),
      ...(filters.creator ? [{ author: { creatorProfile: { isNot: null } } }] : []),
      ...(filters.country ? [{ author: { countryCode: filters.country } }] : []),
      ...(filters.language ? [{ author: { languageCode: filters.language } }] : []),
    ],
  };
}

function scoreCandidate(post: Candidate, query: string, sort: SearchQueryParams["sort"], viewerCountryCode: string | null): number {
  if (sort === "engagement") return calculatePostEngagement(post);
  if (sort === "trending") return calculateTrendingScore(post);
  const textScore = textMatchWeight(query, post.content, ...post.hashtags);
  // Relevance's tiebreak reuses the same age-decayed, geo-boosted score
  // the main feed ranks "For You" with, not a second formula - a more
  // engaging, fresher match among equally-good text matches wins.
  return relevanceScore(textScore, Math.round(calculateScore(post, viewerCountryCode)));
}

type HydratedCandidate = Awaited<ReturnType<typeof hydratePollVotes<Candidate>>>[number];

export type PostSearchResult = Gated<HydratedCandidate>;

export async function searchPosts(params: SearchQueryParams): Promise<SearchPage<PostSearchResult>> {
  if (params.query.trim().length < 2) return { items: [], nextCursor: null };
  const where = await buildWhere(params);

  if (params.sort === "recent") {
    const rows = await prisma.post.findMany({
      where,
      select: SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
    const page = buildKeysetPage(rows, params.limit);
    const hydrated = await hydratePollVotes(page.items, params.viewerId);
    return { items: await applyPremiumGating(hydrated, params.viewerId), nextCursor: page.nextCursor };
  }

  const offset = parseOffsetCursor(params.cursor);
  const cacheKey = `search:posts:v1:${params.viewerId || "anon"}:${params.sort}:${params.query
    .trim()
    .toLowerCase()}:${JSON.stringify(params.filters)}`;

  // Only "relevance" scoring (calculateScore) reads viewerCountryCode -
  // "engagement"/"trending" don't apply the geo boost, matching GET
  // /api/posts/explore's own reasoning for gating this lookup.
  const viewerCountryCode =
    params.viewerId && params.sort === "relevance"
      ? (await prisma.user.findUnique({ where: { id: params.viewerId }, select: { countryCode: true } }))?.countryCode ?? null
      : null;

  const { items, nextCursor } = await paginateRanked<Candidate>(
    cacheKey,
    RANKED_CACHE_TTL_SECONDS,
    offset,
    params.limit,
    async () => {
      const candidateWhere: Prisma.PostWhereInput =
        params.sort === "trending"
          ? { AND: [where, { createdAt: { gte: new Date(Date.now() - TRENDING_WINDOW_HOURS * 60 * 60 * 1000) } }] }
          : where;
      const candidates = await prisma.post.findMany({
        where: candidateWhere,
        select: SELECT,
        orderBy: { createdAt: "desc" },
        take: CANDIDATE_POOL_SIZE,
      });
      return candidates
        .map((post) => ({ post, score: scoreCandidate(post, params.query, params.sort, viewerCountryCode) }))
        .sort((a, b) => b.score - a.score)
        .map((r) => r.post);
    }
  );

  // ⚠️ SECURITY: the ranked list is cached across requests for the same
  // (viewer, sort, query, filters) key - premium gating (and the poll-
  // vote hydration above) must still be applied fresh to this page
  // slice every time, never baked into the cached payload (see
  // src/lib/premium-content.ts and the identical reasoning in GET
  // /api/posts/explore).
  const hydrated = await hydratePollVotes(items, params.viewerId);
  return { items: await applyPremiumGating(hydrated, params.viewerId), nextCursor };
}
