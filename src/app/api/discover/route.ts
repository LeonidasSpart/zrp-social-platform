import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getDiscoverFeed, parseLimit } from "@/lib/discover/feed";

export const dynamic = "force-dynamic";

/**
 * GET /api/discover
 * ============================================================
 * ZRP Discover's vertical-video feed - see docs/discover-backend.md for
 * the full contract. Supports anonymous browsing (same as the existing
 * GET /api/videos Shorts feed and GET /api/posts/explore): personalized
 * viewer state (liked/saved/reposted/followsAuthor) is only populated
 * for a signed-in caller, everything else is identical either way.
 *
 * Query params:
 *   cursor - opaque pagination cursor from a previous response's
 *            `nextCursor` (currently a numeric offset - see
 *            DiscoverFeedService for why - but callers must treat it as
 *            opaque). A missing or invalid cursor restarts from the top
 *            rather than erroring.
 *   limit  - page size, default 20, clamped to a maximum of 50.
 *
 * All actual candidate selection / ranking / diversity / pagination /
 * moderation-and-privacy filtering / premium gating lives in
 * src/lib/discover/ - this route only handles the HTTP concerns:
 * identity, rate limiting, param parsing, and error shape.
 */
export async function GET(req: NextRequest) {
  // Generous relative to normal scroll behavior (a client fetches one
  // page per screenful, not per frame) but real - matches the order of
  // magnitude of /api/ads/impression's own per-IP limit for a
  // similarly high-frequency, partly-anonymous-callable feed endpoint.
  const limited = await rateLimit(req, { limit: 60, window: 60, type: "discover-feed" });
  if (!limited.success) return limited.response;

  try {
    const session = await getServerSession(authOptions);
    const viewerId = session?.user?.id ?? null;

    const cursor = req.nextUrl.searchParams.get("cursor");
    const limit = parseLimit(req.nextUrl.searchParams.get("limit"));

    const page = await getDiscoverFeed({ viewerId, cursor, limit });

    return NextResponse.json(page);
  } catch (error) {
    console.error("Error fetching Discover feed:", error);
    return NextResponse.json({ error: "Failed to fetch Discover feed" }, { status: 500 });
  }
}
