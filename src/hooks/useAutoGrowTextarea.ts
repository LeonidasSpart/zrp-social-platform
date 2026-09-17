import { useLayoutEffect, useRef } from "react";

const DEFAULT_MAX_HEIGHT_PX = 208;

/**
 * Resizes a textarea to fit its current content, up to `maxHeightPx`.
 * Plain function (no hooks) so it's safe to call from a ref callback
 * inside a loop/helper function that isn't itself a React component -
 * e.g. rendering one composer per row in a comment thread, where
 * `useAutoGrowTextarea` below can't be used (hooks can only run inside
 * an actual component or another hook, not a function invoked a
 * variable number of times per render).
 */
export function sizeTextareaToContent(
  el: HTMLTextAreaElement | null,
  maxHeightPx: number = DEFAULT_MAX_HEIGHT_PX
) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, maxHeightPx)}px`;
}

/**
 * Component-level version of `sizeTextareaToContent`: sizes a textarea
 * to fit its content both while typing AND when `value` changes for a
 * reason other than typing (e.g. opening an edit box already pre-filled
 * with an existing multi-line comment) - the inline `onChange`-only
 * resize pattern this replaces only ever fired on a keystroke, so a
 * textarea that opened already containing several lines rendered
 * cropped to one row until the user typed something. Attach the
 * returned ref to the textarea; no onChange wiring needed beyond your
 * own value-setting logic. Only usable from an actual component or
 * custom hook - see `sizeTextareaToContent` above for a per-row/loop
 * context.
 */
export function useAutoGrowTextarea(value: string, maxHeightPx: number = DEFAULT_MAX_HEIGHT_PX) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    sizeTextareaToContent(ref.current, maxHeightPx);
  }, [value, maxHeightPx]);

  return ref;
}
