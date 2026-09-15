/**
 * DiscoverCandidateService
 * ============================================================
 *
 * Owns exactly one job: produce the pool of Post rows DiscoverRankingService
 * is allowed to rank, with every moderation/privacy/relationship rule the
 * rest of ZRP already enforces applied in the database query itself -
 * never as a client-visible "we filtered this out after the fact" step.
 *
 * Reuses existing infrastructure rather than reimplementing it:
 *  - `viewablePostAuthorFilter` (src/lib/permissions.ts) is the SAME
 *    helper /api/posts/explore, /api/search, /api/posts/hashtag/[tag],
 *    lists and communities already use to keep a private account's
 *    posts out of public listings.
 *  - Blocked/muted exclusion is the same combined-array pattern used by
 *    /api/videos, /api/posts/explore and /api/users/[username]/posts
 *    (see the regression test at
 *    src/app/api/posts/__tests__/blocked-muted-feed.integration.test.ts
 *    for why these must be combined into ONE array, not two separate
 *    `where.authorId` assignments).
 *  - Video/GIF classification reuses src/lib/video-media.ts, the same
 *    logic GET /api/videos (the existing Shorts feed) uses - Discover
 *    items are Shorts posts, not a new content type.
 *
 * `banned: false` is added explicitly here (see the comment below) -
 * it is intentionally NOT folded into `viewablePostAuthorFilter` itself,
 * to avoid changing behavior for that helper's other four existing call
 * sites as a side effect of this feature. See docs/discover-backend.md's
 * "Known limitations" section for the audit finding this comes from.
 */

import { prisma } from "@/lib/db";
import { viewablePostAuthorFilter } from "@/lib/permissions";
import { isRealVideoPost } from "@/lib/video-media";
import type { DiscoverCandidatePost } from "./types";

// Matches /api/posts/explore's own candidate pool size - large enough
// for real pagination depth without scanning the whole table, small
// enough that ranking/diversifying it stays a cheap in-process step.
export const CANDIDATE_POOL_SIZE = 200;

async function getExcludedAuthorIds(viewerId: string | null | undefined): Promise<string[]> {
  if (!viewerId) return [];

  const [blocked, blockers, muted] = await Promise.all([
    prisma.blocked.findMany({ where: { blockerId: viewerId }, select: { blockedId: true } }),
    prisma.blocked.findMany({ where: { blockedId: viewerId }, select: { blockerId: true } }),
    prisma.mute.findMany({ where: { muterId: viewerId }, select: { mutedId: true } }),
  ]);

  return Array.from(
    new Set([
      ...blocked.map((b) => b.blockedId),
      ...blockers.map((b) => b.blockerId),
      ...muted.map((m) => m.mutedId),
    ])
  );
}

function candidateSelect() {
  return {
    id: true,
    content: true,
    imageUrl: true,
    mediaType: true,
    createdAt: true,
    views: true,
    commentsEnabled: true,
    authorId: true,
    author: {
      select: {
        id: true,
        username: true,
        name: true,
        avatarUrl: true,
        badgeType: true,
      },
    },
    _count: {
      select: {
        likes: true,
        comments: true,
        reposts: true,
        bookmarks: true,
      },
    },
  } as const;
}

/**
 * Fetches the raw candidate pool for `viewerId` (or the public/anonymous
 * pool when omitted), applying:
 *   - published, non-scheduled, video-typed posts only
 *   - blocked/muted-author exclusion (both directions)
 *   - banned-author exclusion
 *   - private-account exclusion, unless the viewer is the author or an
 *     approved follower (viewablePostAuthorFilter)
 *
 * A final in-process pass re-validates each row with the exact same
 * isRealVideoPost() classifier /api/videos uses, as defense-in-depth
 * against a historical bad row (e.g. a GIF mislabeled `mediaType:
 * "video"`) - the DB filter on `mediaType: "video"` alone is not
 * sufficient, same reasoning /api/videos documents for its own
 * equivalent step.
 */
export async function fetchCandidatePool(
  viewerId: string | null | undefined
): Promise<DiscoverCandidatePost[]> {
  const excludedAuthorIds = await getExcludedAuthorIds(viewerId);

  const posts = await prisma.post.findMany({
    take: CANDIDATE_POOL_SIZE,
    orderBy: { createdAt: "desc" },
    where: {
      authorId: { notIn: excludedAuthorIds },
      status: "published",
      scheduledAt: null,
      mediaType: "video",
      imageUrl: { not: null },
      author: {
        // ⚠️ MODERATION: viewablePostAuthorFilter alone does not exclude
        // a banned author's content (it only governs private-account
        // visibility) - confirmed during the repository audit for this
        // feature that /api/posts/explore has this exact gap today
        // (GET /api/hashtags/search and GET /api/hashtags/trending's
        // search sibling already learned this lesson and add it
        // explicitly, the same way it's added here). Documented as a
        // pre-existing finding in docs/discover-backend.md rather than
        // silently patched into the shared helper or into explore's own
        // route, which is outside this feature's scope.
        banned: false,
        ...viewablePostAuthorFilter(viewerId),
      },
    },
    select: candidateSelect(),
  });

  return posts.filter(isRealVideoPost);
}
