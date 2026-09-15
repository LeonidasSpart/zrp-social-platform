/**
 * DiscoverEventService
 * ============================================================
 *
 * Validates and persists a single client-reported watch event
 * (impression/start/25%/50%/75%/complete/skip - see DiscoverEventType
 * in prisma/schema.prisma). Called only from
 * POST /api/discover/events, which layers IP rate limiting on top
 * (src/lib/rate-limit.ts) before this ever runs.
 *
 * ⚠️ SECURITY: this endpoint is explicitly called out in the directive
 * as high-frequency and attacker-controlled - a signed-out or scripted
 * client can call it directly with any postId/eventType it likes. Two
 * separate defenses, matching the existing precedent in
 * src/app/api/ads/impression/route.ts and src/app/api/ads/click/route.ts
 * (the only other "log a client-reported engagement signal" endpoints
 * in the codebase):
 *
 *  1. The target post must actually exist and still be a live Discover
 *     candidate (published, non-scheduled, video-typed) - otherwise the
 *     event is silently accepted-but-not-recorded (`recorded: false`),
 *     the same "not a hard error" shape the ads routes use for a
 *     campaign that's gone inactive between being served and clicked.
 *     This stops a caller from writing arbitrary rows against deleted/
 *     private/other-typed post ids.
 *  2. Per (post, viewer-or-IP) dedup within a short window for the
 *     high-frequency event types (IMPRESSION/START), identical in
 *     shape to AdImpression's dedup - a real viewer scrolling past the
 *     same item again moments later is not a new, countable signal
 *     either way, and without this a scripted caller could otherwise
 *     inflate a post's engagement-derived rank via nothing but
 *     impression spam. This genuinely covers BOTH signed-in and
 *     anonymous callers: a signed-in caller is deduped by (post,
 *     userId), an anonymous one (no session at all) by (post, ip) -
 *     see the `dedupWhere` branch in recordDiscoverEvent() below. An
 *     earlier version of this file only implemented the userId half
 *     despite this same comment
 *     already claiming "viewer-or-IP" - every anonymous caller was
 *     therefore never deduped at all, undermining the exact defense
 *     this paragraph describes. Fixed without adding any new
 *     authentication requirement: `ip` is resolved the same
 *     trusted-proxy way every other rate-limited route already
 *     resolves it (getRequestIp(), src/lib/rate-limit.ts) - callers
 *     that were anonymous before this fix are still anonymous now.
 *
 * Never trusted as an authoritative score/engagement source on its own
 * - see prisma/schema.prisma's comment on DiscoverEvent.watchedMs and
 * ZRP PLAY's identical documented caveat for client-reported timing
 * (src/lib/play/ - REACTION game).
 *
 * ⚠️ SECURITY: `userId` on every row written here comes from
 * RecordDiscoverEventInput.viewerId, which the route
 * (src/app/api/discover/events/route.ts) populates ONLY from the
 * server-verified JWT (getVerifiedToken) - this module never reads a
 * client-supplied id field, so a spoofed `userId`/`viewerId` in the
 * request body cannot attribute an event to someone else's account.
 * See the regression test "never attributes an event to a client-
 * supplied userId" in
 * src/app/api/discover/events/__tests__/route.integration.test.ts.
 */

import { prisma } from "@/lib/db";
import { DiscoverEventType } from "@prisma/client";

export const DISCOVER_EVENT_TYPES = [
  "IMPRESSION",
  "START",
  "PROGRESS_25",
  "PROGRESS_50",
  "PROGRESS_75",
  "COMPLETE",
  "SKIP",
] as const satisfies readonly DiscoverEventType[];

// Only these event types are deduped - they're the ones a normal
// vertical-scroll session can plausibly re-trigger for the same item
// within seconds (scrolling back up, a re-render). PROGRESS_*/COMPLETE/
// SKIP happen at most a handful of times per real watch session, so
// they're accepted as-is (still bounded overall by the route's IP rate
// limit).
const DEDUPED_EVENT_TYPES: ReadonlySet<DiscoverEventType> = new Set<DiscoverEventType>([
  "IMPRESSION",
  "START",
]);
const DEDUP_WINDOW_MS = 60_000;

// A client-reported watch time beyond this is not physically plausible
// for a single event report and is dropped rather than stored - the
// same "bounded plausibility, not full verification" stance ZRP PLAY's
// REACTION game documents (src/lib/play/scoring.ts) for timing it can't
// independently verify server-side either.
const MAX_PLAUSIBLE_WATCHED_MS = 30 * 60 * 1000; // 30 minutes

export interface RecordDiscoverEventInput {
  postId: unknown;
  eventType: unknown;
  watchedMs?: unknown;
  // Server-verified identity only - see the route handler, which reads
  // this from getVerifiedToken, never from the request body.
  viewerId: string | null | undefined;
  // Trusted-proxy-resolved client IP (getRequestIp(), src/lib/rate-limit.ts).
  // Required (not optional) so a caller of this function can never
  // silently skip the anonymous-dedup path by omitting it - the route
  // always has one (getRequestIp() has a loopback fallback, it never
  // returns null/undefined).
  ip: string;
}

export type RecordDiscoverEventResult =
  | { ok: true; recorded: boolean }
  | { ok: false; status: 400; error: string };

export function isDiscoverEventType(value: unknown): value is DiscoverEventType {
  return typeof value === "string" && (DISCOVER_EVENT_TYPES as readonly string[]).includes(value);
}

export function normalizeWatchedMs(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.min(Math.round(value), MAX_PLAUSIBLE_WATCHED_MS);
}

export async function recordDiscoverEvent(
  input: RecordDiscoverEventInput
): Promise<RecordDiscoverEventResult> {
  const { postId, eventType, viewerId, ip } = input;

  if (typeof postId !== "string" || postId.length === 0) {
    return { ok: false, status: 400, error: "postId is required" };
  }
  if (!isDiscoverEventType(eventType)) {
    return { ok: false, status: 400, error: "Invalid eventType" };
  }

  const watchedMs = normalizeWatchedMs(input.watchedMs);

  // The post must still be a live Discover candidate. Deliberately not
  // re-running the full private/blocked/banned-author check here - the
  // client only ever learns a postId from a feed response that already
  // passed those checks, and this endpoint's job is narrower: don't let
  // it write rows for content that no longer qualifies at all (deleted,
  // unpublished, or not actually a video), which is what an attacker
  // fuzzing arbitrary ids would hit.
  const post = await prisma.post.findFirst({
    where: { id: postId, status: "published", scheduledAt: null, mediaType: "video" },
    select: { id: true },
  });
  if (!post) {
    return { ok: true, recorded: false };
  }

  // ⚠️ SECURITY: a signed-in caller is deduped by (post, userId) - the
  // strongest identity available. A signed-out caller has no userId at
  // all, so it falls back to (post, ip); skipping this fallback (as an
  // earlier version of this function did) would let any anonymous/
  // scripted caller bypass dedup entirely just by omitting a session,
  // which is a strictly weaker but real check - IP can be shared (NAT,
  // a household, a school) or rotated by a determined attacker, so this
  // is a rate-shaping measure layered UNDER the route's hard per-IP
  // rate limit (120/min), not a replacement for it. See "Known
  // limitations" in docs/discover-backend.md.
  if (DEDUPED_EVENT_TYPES.has(eventType)) {
    const dedupWhere = viewerId
      ? { postId, userId: viewerId, eventType }
      : { postId, userId: null, ip, eventType };

    const recent = await prisma.discoverEvent.findFirst({
      where: { ...dedupWhere, createdAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) } },
      select: { id: true },
    });
    if (recent) {
      return { ok: true, recorded: false };
    }
  }

  await prisma.discoverEvent.create({
    data: {
      postId,
      userId: viewerId || null,
      // Never persisted alongside a known userId - see the schema
      // comment on DiscoverEvent.ip for why.
      ip: viewerId ? null : ip,
      eventType,
      watchedMs,
    },
  });

  return { ok: true, recorded: true };
}
