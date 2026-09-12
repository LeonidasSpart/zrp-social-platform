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
 * Locks whenever `active` is true; restores everything when it
 * becomes false or the component unmounts, whichever comes first.
 */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const scrollY = window.scrollY;
    const body = document.body.style;
    const previous = {
      overflow: body.overflow,
      position: body.position,
      top: body.top,
      width: body.width,
    };

    body.overflow = "hidden";
    body.position = "fixed";
    body.top = `-${scrollY}px`;
    body.width = "100%";

    return () => {
      body.overflow = previous.overflow;
      body.position = previous.position;
      body.top = previous.top;
      body.width = previous.width;
      window.scrollTo(0, scrollY);
    };
  }, [active]);
}
