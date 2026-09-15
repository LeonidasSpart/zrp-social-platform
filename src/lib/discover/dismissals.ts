/**
 * DiscoverDismissalService
 * ============================================================
 *
 * "Not interested" - a viewer's content-level negative feedback on a
 * single Discover post (DiscoverDismissal, prisma/schema.prisma).
 * Distinct from Mute/Blocked (both creator-level, already excluded from
 * candidates.ts via getExcludedAuthorIds) - this is deliberately
 * per-post, not per-author, so tapping it once doesn't silently mute a
 * creator the viewer otherwise wants to keep seeing. "Mute creator" and
 * "Block creator" from the same Discover action menu call the existing
 * POST /api/users/mute and POST /api/users/[username]/block endpoints
 * directly - no new backend for those two, they already work and are
 * already enforced here via candidates.ts.
 *
 * Requires a signed-in viewer (unlike DiscoverEventService, which also
 * accepts anonymous rows): this is a stored personal preference, not
 * passive analytics, and there is nowhere to persist it for a
 * signed-out visitor. The route (src/app/api/discover/not-interested/
 * route.ts) enforces that and layers IP rate limiting on top before
 * this ever runs.
 */

import { prisma } from "@/lib/db";

export type RecordDismissalResult =
  | { ok: true; dismissed: boolean }
  | { ok: false; status: 400 | 404; error: string };

export async function recordNotInterested(
  viewerId: string,
  postIdInput: unknown
): Promise<RecordDismissalResult> {
  if (typeof postIdInput !== "string" || postIdInput.length === 0) {
    return { ok: false, status: 400, error: "postId is required" };
  }
  const postId = postIdInput;

  // Mirrors DiscoverEventService's own "must still be a live candidate"
  // check - stops a caller from writing rows against a deleted or
  // never-existed post id. Unlike events, a not-found post here IS an
  // error (400/404) rather than a silent no-op: this is a real,
  // user-visible action ("Not interested" removes the item from the
  // feed immediately), so the client needs to know if it didn't apply.
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true },
  });
  if (!post) {
    return { ok: false, status: 404, error: "Post not found" };
  }

  // Idempotent by design (the same @@unique([userId, postId]) pattern
  // as Bookmark/Mute/Blocked) - tapping "Not interested" twice, or a
  // retried request after a dropped response, never errors or creates
  // a duplicate row.
  await prisma.discoverDismissal.upsert({
    where: { userId_postId: { userId: viewerId, postId } },
    create: { userId: viewerId, postId },
    update: {},
  });

  return { ok: true, dismissed: true };
}

/** Post ids this viewer has explicitly marked "Not interested" in. */
export async function getDismissedPostIds(
  viewerId: string | null | undefined
): Promise<string[]> {
  if (!viewerId) return [];

  const rows = await prisma.discoverDismissal.findMany({
    where: { userId: viewerId },
    select: { postId: true },
  });

  return rows.map((row) => row.postId);
}
