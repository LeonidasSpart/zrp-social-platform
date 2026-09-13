import { useEffect } from "react";

/*
 * ============================================================
 * iOS-safe body scroll lock
 * ============================================================
 *
 * `document.body.style.overflow = "hidden"` alone does not stop the
 * page scrolling behind a fullscreen overlay on iOS Safari: touch
 * events there can still scroll/rubber-band the body even with
 * `overflow: hidden` set, because the visual viewport is not the same
 * as the layout viewport. The standard, well-established fix is to
 * ALSO pin the body out of the document flow entirely
 * (`position: fixed`) while remembering the scroll offset, then
 * restore both the styles and the scroll position on cleanup - a
 * plain `overflow: hidden` degrades correctly on every other browser,
 * but only this combination is reliable on iOS.
 *
 * ⚠️ Module-level reference count, not per-call state: this hook can
 * have more than one simultaneous consumer (e.g. PostCard's own
 * lightbox and the VideoFeedViewer it renders as a child can both be
 * open at once, each with their own `useBodyScrollLock` instance).
 * The first bug this closes: capturing/restoring `document.body.style`
 * independently per call means whichever consumer happens to UNMOUNT
 * FIRST restores the body to ITS OWN captured "before" snapshot -
 * which, for the second lock to have been applied, was already the
 * FIRST lock's locked state - unlocking the page while an earlier
 * consumer is still supposed to be holding the lock. Only the
 * transition from 0 locks to 1 may capture the real pre-lock styles,
 * and only the transition from 1 lock back to 0 may restore them;
 * every count in between is a no-op on the shared body styles. This
 * also handles React StrictMode's double-invoke correctly, since each
 * effect body's own increment is always paired with its own cleanup's
 * decrement regardless of how many times the pair runs.
 */
let lockCount = 0;
let savedBodyState: { overflow: string; position: string; top: string; width: string; scrollY: number } | null = null;

/** Exported only for the reference-counting test below - not part of the public hook API. */
export function lockBodyScroll() {
  if (lockCount === 0) {
    const scrollY = window.scrollY;
    const body = document.body.style;
    savedBodyState = {
      overflow: body.overflow,
      position: body.position,
      top: body.top,
      width: body.width,
      scrollY,
    };
    body.overflow = "hidden";
    body.position = "fixed";
    body.top = `-${scrollY}px`;
    body.width = "100%";
  }
  lockCount += 1;
}

/** Exported only for the reference-counting test below - not part of the public hook API. */
export function unlockBodyScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0 && savedBodyState) {
    const body = document.body.style;
    body.overflow = savedBodyState.overflow;
    body.position = savedBodyState.position;
    body.top = savedBodyState.top;
    body.width = savedBodyState.width;
    window.scrollTo(0, savedBodyState.scrollY);
    savedBodyState = null;
  }
}

/**
 * Locks whenever `active` is true; releases its own hold when it
 * becomes false or the component unmounts, whichever comes first. The
 * body only actually unlocks once every concurrent holder has released.
 */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, [active]);
}
