/**
 * Core math for keeping a focused, auto-growing textarea visible above
 * an on-screen keyboard. Extracted as a pure function (rather than
 * inlined where it's used, in PostComposer.tsx's keepTypedTextVisible)
 * so the actual bug - "the bottom of the textarea can end up below what
 * the keyboard leaves visible" - has real regression coverage: jsdom has
 * no layout engine, so a DOM-level test can't exercise real bounding
 * rects or `visualViewport`, but this arithmetic is exactly what was
 * missing before the fix, and is fully testable on its own.
 *
 * Returns how far to scroll the page down (in px) to bring `elementBottom`
 * back inside `viewportHeight`, plus a small margin so the caret isn't
 * flush against the edge - or 0 when the element already fits.
 */
export function computeKeyboardScrollAdjustment(
  elementBottom: number,
  viewportHeight: number,
  margin = 16
): number {
  const overflow = elementBottom - viewportHeight;
  return overflow > 0 ? overflow + margin : 0;
}
