import { NextRequest, NextResponse } from "next/server";
import { getAllHashtagCounts } from "@/lib/hashtags/counts";

export const dynamic = 'force-dynamic';

// Previously ran its own inline "scan the most recent 1000 posts, tally
// hashtags" query with no filtering at all - a post from an unpublished,
// still-scheduled, or banned author counted toward a tag's trending
// score exactly like any live post. GET /api/hashtags/search (built for
// Advanced Search) already does this same scan-and-tally through the
// shared getAllHashtagCounts() (src/lib/hashtags/counts.ts), filtered to
// published/non-scheduled/non-banned-author posts, and caches the raw
// scan itself (5 min TTL) - reusing it here removes both the duplicate
// query and the filtering gap in one change, rather than maintaining two
// slightly different hashtag tallies.
export async function GET(req: NextRequest) {
  try {
    const requestedLimit = parseInt(req.nextUrl.searchParams.get("limit") || "10", 10);
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 10, 1), 50);

    const trending = await getAllHashtagCounts();

    return NextResponse.json(trending.slice(0, limit));
  } catch (error) {
    console.error("Trending error:", error);
    return NextResponse.json({ error: "Failed to fetch trending hashtags" }, { status: 500 });
  }
}
