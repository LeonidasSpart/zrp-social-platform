"use client";

// A single source of truth for "does this viewer want video sound on",
// shared across every video surface (the Shorts feed, the
// VideoFeedViewer modal opened from a feed post, and Discover) so
// unmuting in one carries into the others, and the choice survives a
// reload/reopen instead of silently resetting to muted every time -
// previously each surface owned its own unpersisted `useState(true)`.
const STORAGE_KEY = "zrp:video-sound-preference";

export function getStoredSoundPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "unmuted";
  } catch {
    return false;
  }
}

export function setStoredSoundPreference(wantsSound: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, wantsSound ? "unmuted" : "muted");
  } catch {
    // Storage can be unavailable (private browsing, blocked cookies) -
    // the preference just doesn't persist that session; playback
    // itself is unaffected either way.
  }
}

/**
 * Plays a video element honoring the viewer's sound preference, with
 * the one fallback every mainstream browser actually requires: an
 * audible autoplay call can be silently rejected by the browser's own
 * autoplay policy (no user gesture yet, or too low a Media Engagement
 * Index for this site) even though the API gives no synchronous way to
 * ask first. When that happens this retries muted so the video still
 * starts playing instead of sitting frozen, and reports the fallback so
 * the caller can reflect it in its own mute-icon state - never show a
 * "sound is on" icon while nothing is actually audible.
 *
 * This never tries to bypass the policy: if the browser genuinely
 * blocks audible playback, playback always ends up muted, exactly as
 * the policy requires - the persisted preference is left untouched so
 * the next video still attempts audible playback again.
 */
export function playRespectingSoundPreference(
  video: HTMLVideoElement,
  wantsSound: boolean,
  onFallbackToMuted?: () => void
): void {
  video.muted = !wantsSound;
  const attempt = video.play();
  if (!attempt || typeof attempt.catch !== "function") return;
  attempt.catch(() => {
    if (!wantsSound) return; // already muted - nothing to fall back from
    video.muted = true;
    onFallbackToMuted?.();
    video.play().catch(() => {
      // Truly can't play at all (unsupported source, revoked blob URL,
      // etc.) - the surface's own onError/retry handling takes over.
    });
  });
}
