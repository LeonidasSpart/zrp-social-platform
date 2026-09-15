/**
 * Pure, client-safe watch-event logic for ZRP Discover
 * (src/app/discover/page.tsx). Deliberately separate from
 * src/lib/discover/* (which imports `prisma` and is server-only) - this
 * file has zero DOM/timer/network dependencies so it is trivially
 * unit-testable and is the single place the "which event fires now"
 * decision lives, rather than being inlined into the page component.
 *
 * The actual POST to /api/discover/events, and its own per-(post,
 * viewer-or-IP) dedup window, live server-side (src/lib/discover/events.ts).
 * This module's job is narrower: decide, from real playback progress and
 * "what has this component already sent for this post", which NEW event
 * types should be sent - so a re-render, a remount, an autoplay retry, a
 * mute toggle or a timeupdate tick that reports the same progress twice
 * never re-fires an event the caller already fired. That "already fired"
 * set is owned by the caller (a ref in the page component) precisely so
 * it naturally resets when a fresh discover session starts, and persists
 * across re-renders (not remounts) of the same slide.
 */

export type DiscoverWatchEventType =
  | "IMPRESSION"
  | "START"
  | "PROGRESS_25"
  | "PROGRESS_50"
  | "PROGRESS_75"
  | "COMPLETE"
  | "SKIP";

const PROGRESS_THRESHOLDS: { type: DiscoverWatchEventType; ratio: number }[] = [
  { type: "PROGRESS_25", ratio: 0.25 },
  { type: "PROGRESS_50", ratio: 0.5 },
  { type: "PROGRESS_75", ratio: 0.75 },
];

// A real <video>'s `timeupdate` fires at a coarse, browser-controlled
// interval - the last tick before the clip ends is very rarely exactly
// `duration`. 0.98 treats "close enough to the end" as complete without
// requiring an exact match that may never occur for a given clip length.
const COMPLETE_RATIO = 0.98;

/**
 * Given current playback progress and the event types already recorded
 * as fired for this post in this viewing session, returns the new
 * progress-family events (25/50/75/COMPLETE) that should fire now, in
 * threshold order. Never returns a type already in `alreadyFired`.
 * Returns [] for a non-finite/zero duration (metadata not loaded yet) -
 * there is no progress ratio to compute.
 */
export function getProgressEventsToFire(
  currentTime: number,
  duration: number,
  alreadyFired: ReadonlySet<DiscoverWatchEventType>
): DiscoverWatchEventType[] {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(currentTime)) {
    return [];
  }

  const ratio = Math.min(1, Math.max(0, currentTime / duration));
  const toFire: DiscoverWatchEventType[] = [];

  for (const threshold of PROGRESS_THRESHOLDS) {
    if (ratio >= threshold.ratio && !alreadyFired.has(threshold.type)) {
      toFire.push(threshold.type);
    }
  }

  if (ratio >= COMPLETE_RATIO && !alreadyFired.has("COMPLETE")) {
    toFire.push("COMPLETE");
  }

  return toFire;
}

/**
 * Whether leaving a slide right now should be reported as a SKIP.
 * Only true once real playback actually started (a bare impression -
 * scrolled past without ever playing - isn't a "skip", it's just normal
 * browsing) and only once per post (never re-fired once already sent,
 * and never sent at all for a post that played all the way through).
 */
export function shouldFireSkip(alreadyFired: ReadonlySet<DiscoverWatchEventType>): boolean {
  return alreadyFired.has("START") && !alreadyFired.has("COMPLETE") && !alreadyFired.has("SKIP");
}

/**
 * Whether an IMPRESSION should fire for a post becoming the active
 * slide. False if one already fired this session - the server also
 * dedups IMPRESSION/START within its own 60s window (see
 * DEDUPED_EVENT_TYPES in src/lib/discover/events.ts), but deciding this
 * client-side too means a slide that flickers active/inactive/active
 * during fast scrolling (IntersectionObserver ratio jitter) never even
 * issues the redundant request in the first place.
 */
export function shouldFireImpression(alreadyFired: ReadonlySet<DiscoverWatchEventType>): boolean {
  return !alreadyFired.has("IMPRESSION");
}

/** Same reasoning as shouldFireImpression, for the first real `playing` event. */
export function shouldFireStart(alreadyFired: ReadonlySet<DiscoverWatchEventType>): boolean {
  return !alreadyFired.has("START");
}
