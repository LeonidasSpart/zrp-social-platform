import { NextRequest, NextResponse } from "next/server";
import { getAllHashtagCounts } from "@/lib/hashtags/counts";

export const dynamic = "force-dynamic";

// There is no dedicated Hashtag table - hashtags live as a plain
// String[] on Post (see prisma/schema.prisma), the same design
// /api/hashtags/trending already works within. getAllHashtagCounts
// (src/lib/hashtags/counts.ts) reuses that same "scan the most recent
// posts, tally tags in memory" approach (and its cache key convention/
// TTL), just keeping every distinct tag instead of only the top 50, so
// a search for a real but less-popular hashtag still finds it. That
// module is also what Advanced Search's hashtags category (src/lib/
// search/categories/hashtags.ts) calls, instead of a second tally.
//
// Unlike trending, this scan filters to posts that are actually public,
// live content: published, not still scheduled, and not from a banned
// author. Trending doesn't do this today, but a brand-new search
// feature surfacing a hashtag that only exists on removed/unpublished/
// banned-author content would be a real moderation gap to ship with.
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

// GET /api/hashtags/search?q=<partial tag>&limit=&cursor=
// Prefix match against the tag (leading "#" stripped if present),
// ranked by post count - real hashtag search, distinct from
// /api/search?type=posts, which only matches a hashtag the caller
// already typed out in full as part of a broader post-content search.
// Cursor is a numeric offset into the ranked match list, the same
// convention /api/posts/explore already uses for its own non-relational
// (in this case, non-relational-*for the same reason*: no single-table
// row backs one "hashtag") result set.
export async function GET(req: NextRequest) {
  try {
    const rawQuery = (req.nextUrl.searchParams.get("q") || "")
      .trim()
      .toLowerCase()
      .replace(/^#/, "");

    if (!rawQuery) {
      return NextResponse.json({ items: [], nextCursor: null });
    }

    const rawLimit = parseInt(req.nextUrl.searchParams.get("limit") || "", 10);
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT;

    const rawCursor = parseInt(req.nextUrl.searchParams.get("cursor") || "", 10);
    const offset = Number.isFinite(rawCursor) && rawCursor > 0 ? rawCursor : 0;

    const all = await getAllHashtagCounts();
    const matches = all.filter((h) => h.tag.startsWith(rawQuery));

    const page = matches.slice(offset, offset + limit);
    const nextOffset = offset + page.length;
    const nextCursor = nextOffset < matches.length ? String(nextOffset) : null;

    return NextResponse.json({ items: page, nextCursor });
  } catch (error) {
    console.error("Hashtag search error:", error);
    return NextResponse.json({ error: "Failed to search hashtags" }, { status: 500 });
  }
}
