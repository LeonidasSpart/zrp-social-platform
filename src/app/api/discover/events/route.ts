export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
// ⚠️ SECURITY: getVerifiedToken is a drop-in for getToken() that overlays the
// database's current role/isAdmin/plan/banned onto the decoded JWT and
// returns null for a banned or deleted account - see src/lib/auth-guards.ts.
import { getVerifiedToken as getToken } from "@/lib/auth-guards";
import { rateLimit } from "@/lib/rate-limit";
import { recordDiscoverEvent } from "@/lib/discover/events";

/**
 * POST /api/discover/events
 * ============================================================
 * Records one Discover watch-event signal (impression/start/25%/50%/
 * 75%/complete/skip) - see DiscoverEventType in prisma/schema.prisma
 * and DiscoverEventService (src/lib/discover/events.ts) for validation,
 * dedup and the security reasoning. Same request/response shape family
 * as the existing /api/ads/impression and /api/ads/click routes (the
 * only other "log a client-reported engagement signal" endpoints in
 * ZRP), reused deliberately rather than inventing a third convention.
 *
 * Body: { postId: string, eventType: DiscoverEventType, watchedMs?: number }
 * Response: { recorded: boolean } - `recorded: false` is not an error
 * (e.g. the post no longer qualifies, or this was deduped); it just
 * means nothing new was written.
 */
export async function POST(req: NextRequest) {
  // Explicitly called out in the directive as a high-frequency,
  // attacker-controlled surface - rate limited per IP the same way
  // /api/ads/impression is, generous enough for a real vertical-scroll
  // session (several events per item, several items per minute) but
  // real.
  const limited = await rateLimit(req, { limit: 120, window: 60, type: "discover-event" });
  if (!limited.success) return limited.response;

  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    const viewerId = typeof token?.id === "string" ? token.id : null;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const result = await recordDiscoverEvent({
      postId: (body as Record<string, unknown>).postId,
      eventType: (body as Record<string, unknown>).eventType,
      watchedMs: (body as Record<string, unknown>).watchedMs,
      viewerId,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ recorded: result.recorded });
  } catch (error) {
    console.error("Error recording Discover event:", error);
    // Analytics failures must never break playback for the client -
    // same "fail silently, this isn't critical" stance the existing
    // POST /api/posts/[id]/view route already takes.
    return NextResponse.json({ recorded: false }, { status: 200 });
  }
}
