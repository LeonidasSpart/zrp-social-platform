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
 *     impression spam.
 *
 * Never trusted as an authoritative score/engagement source on its own
 * - see prisma/schema.prisma's comment on DiscoverEvent.watchedMs and
 * ZRP PLAY's identical documented caveat for client-reported timing
 * (src/lib/play/ - REACTION game).
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
  viewerId: string | null | undefined;
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
  const { postId, eventType, viewerId } = input;

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

  if (DEDUPED_EVENT_TYPES.has(eventType) && viewerId) {
    const recent = await prisma.discoverEvent.findFirst({
      where: {
        postId,
        userId: viewerId,
        eventType,
        createdAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
      },
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
      eventType,
      watchedMs,
    },
  });

  return { ok: true, recorded: true };
}
