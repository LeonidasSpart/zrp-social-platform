// Shared, pure decision logic for the two video/Shorts surfaces
// (src/app/shorts/page.tsx and src/components/VideoFeedViewer.tsx).
//
// Both components already carry their own GIF/video media-type detection
// (isGifMedia/isVideoMedia) - that logic is unrelated to premium gating
// and is left alone here. What's extracted to this single, tested place
// is the one piece of logic both surfaces need to agree on now that
// GET /api/videos runs every post through applyPremiumGating()
// (src/lib/premium-content.ts): a locked pay-per-view video is returned
// with `imageUrl: null` (its `premiumPost.locked` field set instead), so
// the existing "no imageUrl -> not a real video, drop it" filter in both
// components would otherwise silently remove locked premium Shorts from
// the feed instead of showing the (safe, media-free) locked state.

export interface GatedVideoPost {
  imageUrl?: string | null;
  premiumPost?: {
    locked: boolean;
  } | null;
}

/**
 * A locked pay-per-view post: real content exists but this viewer hasn't
 * purchased it (and isn't the author), so the API already redacted
 * imageUrl to null. Never trust `!imageUrl` alone to mean "not a video"
 * for these - they still belong in the feed, just without a playable
 * <video src>.
 */
export function isLockedPremiumVideoPost(
  post: GatedVideoPost
): boolean {
  return post.premiumPost?.locked === true;
}

/**
 * Should this post occupy a slide in the video feed at all? True for a
 * post with real media to filter for playability (the caller still runs
 * its own GIF/video media-type check on `imageUrl`), OR for a locked
 * premium post that has no `imageUrl` *because* it's gated rather than
 * because it was never a real video.
 */
export function belongsInVideoFeed(
  post: GatedVideoPost
): boolean {
  if (isLockedPremiumVideoPost(post)) {
    return true;
  }

  return !!post.imageUrl;
}
