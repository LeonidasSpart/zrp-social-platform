export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
// ⚠️ SECURITY: getVerifiedToken is a drop-in for getToken() that overlays the
// database's current role/isAdmin/plan/banned onto the decoded JWT and
// returns null for a banned or deleted account - see src/lib/auth-guards.ts.
import { getVerifiedToken as getToken } from "@/lib/auth-guards";
import { rateLimit } from "@/lib/rate-limit";
import { recordNotInterested } from "@/lib/discover/dismissals";

/**
 * POST /api/discover/not-interested
 * ============================================================
 * Records a viewer's "Not interested" on a single Discover post - see
 * DiscoverDismissalService (src/lib/discover/dismissals.ts). Unlike
 * /api/discover/events, this requires a signed-in viewer: it's a
 * stored personal preference the candidate query reads on every future
 * request, not passive analytics, and there is nowhere to persist it
 * for a signed-out visitor.
 *
 * Body: { postId: string }
 * Response: { dismissed: true } on success.
 */
export async function POST(req: NextRequest) {
  // Same shape as /api/discover/events' own rate limit - generous for a
  // real session (a viewer dismissing several items in a row) while
  // still bounding a scripted caller.
  const limited = await rateLimit(req, { limit: 30, window: 60, type: "discover-not-interested" });
  if (!limited.success) return limited.response;

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const viewerId = typeof token?.id === "string" ? token.id : null;
  if (!viewerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const result = await recordNotInterested(viewerId, (body as Record<string, unknown>).postId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ dismissed: result.dismissed });
}
