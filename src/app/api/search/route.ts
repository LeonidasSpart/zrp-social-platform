import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getExcludedAuthorIds } from "@/lib/permissions";
import { jsonWithDecimals } from "@/lib/serialize-decimal";
import { parseSearchCategory, parseSearchFilters, parseSearchSort } from "@/lib/search/params";
import type { SearchCategory, SearchQueryParams } from "@/lib/search/types";
import { searchUsers } from "@/lib/search/categories/users";
import { searchPosts } from "@/lib/search/categories/posts";
import { searchHashtags } from "@/lib/search/categories/hashtags";
import { searchCommunities } from "@/lib/search/categories/communities";
import { searchNews } from "@/lib/search/categories/news";
import { searchMusic } from "@/lib/search/categories/music";
import { searchOpportunities } from "@/lib/search/categories/opportunities";
import { searchMarketplace } from "@/lib/search/categories/marketplace";

// ─── GET /api/search — Advanced Search ────────────────────────────────
// See docs/advanced-search-architecture.md for the full contract.
//
// ?q=<query>                          required, min 2 chars
// &type=all|users|posts|hashtags|communities|news|music|opportunities|marketplace
// &sort=relevance|recent|engagement|trending
// &dateRange=any|24h|7d|30d|custom    (&dateFrom=, &dateTo= for custom)
// &language=<ISO 639-1>  &country=<ISO 3166-1 alpha-2>
// &media=image|video|gif|poll|none    (Posts only)
// &verified=true  &professional=true  &creator=true
// &community=<slug>                   (scopes Posts/Hashtags to one Community)
// &cursor=<opaque>  &limit=<n>
//
// type=all (the default, and the ONLY mode the pre-existing callers
// below ever use) returns the pre-existing {users, posts} shape
// UNCHANGED, plus the same shape for every other category - additive,
// not a breaking change. It is a fixed-size teaser per category
// (`cursor` is ignored in this mode); a client asking for "more" of one
// category switches to type=<category>, which honors `cursor`/`limit`
// for genuine pagination and returns {results, nextCursor, category,
// sort}. Existing callers that only read `.users`/`.posts` - the Web
// mention-autocomplete's own call, Android's SearchViewModel/
// OpponentSearchView/UserMultiSelectField/CreatePostViewModel and iOS's
// SearchViewModel/PlayChallengeView/PeoplePickerView - keep working
// unchanged, since they never read the new keys.
const ALL_MODE_LIMITS: Partial<Record<SearchCategory, number>> = {
  // Preserves the exact pre-existing counts those callers already
  // depend on (10 users for mention-autocomplete-style pickers, 20
  // posts) - every other category is new, so 5 is a reasonable teaser
  // size with no legacy expectation to match.
  users: 10,
  posts: 20,
};
const ALL_MODE_DEFAULT_LIMIT = 5;
const SINGLE_CATEGORY_DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const CATEGORY_SEARCHERS: Record<SearchCategory, (params: SearchQueryParams) => Promise<{ items: unknown[]; nextCursor: string | null }>> = {
  users: searchUsers,
  posts: searchPosts,
  hashtags: searchHashtags,
  communities: searchCommunities,
  news: searchNews,
  music: searchMusic,
  opportunities: searchOpportunities,
  marketplace: searchMarketplace,
};

function parseLimit(req: NextRequest, fallback: number): number {
  const raw = parseInt(req.nextUrl.searchParams.get("limit") || "", 10);
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, MAX_LIMIT) : fallback;
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q") || "";

  const category = parseSearchCategory(req);
  const sort = parseSearchSort(req);
  const filters = parseSearchFilters(req);

  if (query.trim().length < 2) {
    // Preserves the exact pre-existing empty-query shape for `type=all`
    // callers; a single-category request gets the single-category
    // empty shape instead of a bare {users:[], posts:[]}.
    return category === "all"
      ? NextResponse.json({ users: [], posts: [] })
      : NextResponse.json({ results: [], nextCursor: null, category, sort });
  }

  try {
    const session = await getServerSession(authOptions);
    const viewerId: string | null = session?.user?.id ?? null;
    const excludedAuthorIds = await getExcludedAuthorIds(viewerId);

    if (category !== "all") {
      const cursor = req.nextUrl.searchParams.get("cursor");
      const limit = parseLimit(req, SINGLE_CATEGORY_DEFAULT_LIMIT);
      const params: SearchQueryParams = { query, sort, filters, viewerId, excludedAuthorIds, cursor, limit };
      const { items, nextCursor } = await CATEGORY_SEARCHERS[category](params);
      // ⚠️ Listing.price (marketplace) is a Prisma Decimal, which
      // JSON.stringify serializes as a decimal.js internal object, not
      // a plain number - jsonWithDecimals walks the payload and
      // converts every Decimal to a number first (src/lib/serialize-
      // decimal.ts, the same helper GET /api/listings already uses).
      return jsonWithDecimals({ results: items, nextCursor, category, sort });
    }

    const categories = Object.keys(CATEGORY_SEARCHERS) as SearchCategory[];
    const entries = await Promise.all(
      categories.map(async (cat) => {
        const limit = ALL_MODE_LIMITS[cat] ?? ALL_MODE_DEFAULT_LIMIT;
        const params: SearchQueryParams = { query, sort, filters, viewerId, excludedAuthorIds, cursor: null, limit };
        const page = await CATEGORY_SEARCHERS[cat](params);
        return [cat, page] as const;
      })
    );

    const results: Record<string, unknown> = {};
    const nextCursors: Record<string, string | null> = {};
    for (const [cat, page] of entries) {
      results[cat] = page.items;
      nextCursors[cat] = page.nextCursor;
    }

    return jsonWithDecimals({ ...results, nextCursors, sort });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
