// Mirrors PostCard.tsx's own CONTENT_TRUNCATE_LENGTH - same real
// character-count threshold, not an invented one, for a caption
// overlaid on a Short.
export const SHORTS_CAPTION_TRUNCATE_LENGTH = 280;

/**
 * The Shorts caption disclosure's whole decision, as one pure function of
 * real inputs - no CSS, no layout, no rendering engine involved - so it
 * behaves identically regardless of flex context or browser.
 *
 * This replaces an earlier version that truncated with CSS line-clamp-2
 * on the collapsed span and a max-h-40 (160px) scrollable box on the
 * expanded one. That inverted itself for any caption long enough to
 * exceed 160px of wrapped text: whenever line-clamp failed to engage (it
 * does not reliably apply inside a flex descendant, such as the Shorts
 * caption's own flex-1 AUTHOR column ancestor - a known cross-browser
 * line-clamp/flex interaction, most consistently reported in
 * WebKit/Safari, i.e. iOS PWA), the "collapsed" span rendered with no
 * clamp at all - i.e. the full caption - and tapping "Show more" then
 * imposed the 160px cap for the first time, visibly shrinking what was
 * already fully visible. That is the exact "opens full, Show more
 * shrinks it" bug a real user reported on the PWA. Even where line-clamp
 * did engage correctly (collapsed to a real 2 lines), expanding into a
 * fixed 160px box silently cut off any caption whose full text needed
 * more than 160px, with no "Show less" ever offered to get back to the
 * preview - there was no expanded-state label at all.
 *
 * A plain character-count slice never depends on flex layout or a
 * specific rendering engine, so it cannot reproduce either failure mode.
 * A caption at or under [truncateLength] is never "long": isLong stays
 * false and displayText is always the untouched original - nothing to
 * disclose, so no button is shown at all. For a long caption, collapsed
 * returns a real character-slice preview and expanded always returns the
 * complete, original string - never a second, silently-shorter copy.
 */
export function getCaptionDisplayState(
  content: string,
  isExpanded: boolean,
  truncateLength: number = SHORTS_CAPTION_TRUNCATE_LENGTH
): { isLong: boolean; displayText: string } {
  const isLong = content.length > truncateLength;
  const displayText =
    isLong && !isExpanded
      ? `${content.slice(0, truncateLength)}...`
      : content;
  return { isLong, displayText };
}
