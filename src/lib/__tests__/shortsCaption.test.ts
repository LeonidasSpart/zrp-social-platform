import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { getCaptionDisplayState, SHORTS_CAPTION_TRUNCATE_LENGTH } from "@/lib/shortsCaption";

/**
 * Regression coverage for the real user-reported Shorts caption bug:
 * opening a Short with a long caption showed the FULL text immediately,
 * and tapping "Show more" made it SHORTER - inverted from the intended
 * "collapsed preview -> Show more -> complete text" disclosure.
 *
 * Root cause: the caption used CSS line-clamp-2 to truncate the
 * collapsed state and a fixed max-h-40 (160px) scrollable box for the
 * expanded state. line-clamp does not reliably apply inside a flex
 * descendant (the caption sits inside the flex-1 AUTHOR column of the
 * Shorts bottom overlay's flex row) - a known cross-browser line-clamp/
 * flex interaction most consistently reported in WebKit/Safari, i.e. an
 * iOS PWA, which is exactly the environment the real bug report came
 * from. Whenever the clamp failed to engage, the "collapsed" state
 * rendered the entire caption uncapped, and tapping "Show more" then
 * imposed the 160px cap for the first time - visibly shrinking text that
 * was already fully visible. Even when line-clamp did engage correctly,
 * the 160px expanded box silently cut off any caption whose full text
 * needed more room, with no "Show less" ever offered to get back - there
 * was no expanded-state label at all in the old implementation.
 *
 * getCaptionDisplayState replaces all of that with a plain, real
 * character-count slice (matching PostCard.tsx's own
 * CONTENT_TRUNCATE_LENGTH convention) that cannot depend on flex layout
 * or a specific rendering engine, so these are real, executable
 * assertions - not source guards - and would fail immediately against
 * the old CSS-only approach (which had no such function to import at
 * all).
 */
describe("getCaptionDisplayState", () => {
  const LONG_CAPTION = [
    "Qofsh grua apo burrë, i ri apo i moshuar, i pasur apo i varfër, i sëmurë apo në gjendje të mirë, nuk ka rëndësi statusi apo rruga jote në jetë: ZRP është për të gjithë.",
    "ZRP është për çdo njeri që ka një zë, edhe atëherë kur të tjerët nuk duan ta dëgjojnë.",
    "Këtu kanë vend idetë e tua. Mendimet e tua. Diferencat e tua.",
    "Liria e shprehjes nuk duhet të jetë privilegj. Ajo duhet të jetë një e drejtë.",
    "ZRP synon të krijojë një hapësirë ku çdokush mund të shprehet, të ndajë mendimet e tij, të diskutojë dhe të dëgjohet, duke respektuar të tjerët.",
    "Sepse jemi të ndryshëm, por jetojmë në të njëjtin planet.",
  ].join("\n");

  // CASE 1: short caption -> displayed normally, no unnecessary Show more.
  it("a caption at or under the threshold is never long and is returned untouched", () => {
    const short = "A short caption.";
    const result = getCaptionDisplayState(short, false);
    expect(result.isLong).toBe(false);
    expect(result.displayText).toBe(short);
  });

  it("a caption exactly at the threshold length is not long", () => {
    const exact = "x".repeat(SHORTS_CAPTION_TRUNCATE_LENGTH);
    expect(getCaptionDisplayState(exact, false).isLong).toBe(false);
    expect(getCaptionDisplayState(exact, false).displayText).toBe(exact);
  });

  // CASE 2: long caption -> initial (collapsed) state is truncated.
  it("a long caption is truncated when collapsed (the initial state)", () => {
    expect(LONG_CAPTION.length).toBeGreaterThan(SHORTS_CAPTION_TRUNCATE_LENGTH);
    const result = getCaptionDisplayState(LONG_CAPTION, false);
    expect(result.isLong).toBe(true);
    expect(result.displayText.length).toBe(SHORTS_CAPTION_TRUNCATE_LENGTH + 3); // + "..."
    expect(result.displayText.endsWith("...")).toBe(true);
    expect(LONG_CAPTION.startsWith(result.displayText.slice(0, -3))).toBe(true);
  });

  // CASE 3: long caption + expanded -> the COMPLETE text, never a second,
  // shorter copy (this is the exact inversion the real bug produced).
  it("a long caption is returned in full, untruncated, when expanded", () => {
    const result = getCaptionDisplayState(LONG_CAPTION, true);
    expect(result.isLong).toBe(true);
    expect(result.displayText).toBe(LONG_CAPTION);
    expect(result.displayText.length).toBe(LONG_CAPTION.length);
  });

  // CASE 4: toggling back returns to the exact same truncated preview -
  // collapse is deterministic, not a one-way ratchet.
  it("collapsing after expanding returns to the identical truncated preview", () => {
    const collapsedBefore = getCaptionDisplayState(LONG_CAPTION, false);
    const expanded = getCaptionDisplayState(LONG_CAPTION, true);
    const collapsedAfter = getCaptionDisplayState(LONG_CAPTION, false);
    expect(expanded.displayText).not.toBe(collapsedBefore.displayText);
    expect(collapsedAfter).toEqual(collapsedBefore);
  });

  // The exact regression: expanded must never be shorter than collapsed.
  it("the expanded text is never shorter than the collapsed preview (the reported inversion)", () => {
    const collapsed = getCaptionDisplayState(LONG_CAPTION, false);
    const expanded = getCaptionDisplayState(LONG_CAPTION, true);
    expect(expanded.displayText.length).toBeGreaterThan(collapsed.displayText.length);
  });

  // CASE 7: multiple captions of different lengths behave independently -
  // guaranteed here since the function is pure and stateless per call.
  it("captions of different lengths are each evaluated independently", () => {
    const short = "Short one.";
    const long = LONG_CAPTION;
    expect(getCaptionDisplayState(short, false).isLong).toBe(false);
    expect(getCaptionDisplayState(long, false).isLong).toBe(true);
    // Evaluating the long one first must not affect the short one.
    expect(getCaptionDisplayState(short, false).displayText).toBe(short);
  });

  // CASE 8: line breaks / paragraphs survive truncation and expansion.
  it("preserves embedded line breaks in both the truncated and full text", () => {
    expect(LONG_CAPTION.includes("\n")).toBe(true);
    const collapsed = getCaptionDisplayState(LONG_CAPTION, false);
    const expanded = getCaptionDisplayState(LONG_CAPTION, true);
    expect(expanded.displayText.includes("\n")).toBe(true);
    // The collapsed preview may or may not include a line break depending
    // on where the threshold falls, but whatever precedes it must be an
    // exact prefix of the original - slicing never rewrites content.
    expect(LONG_CAPTION.slice(0, SHORTS_CAPTION_TRUNCATE_LENGTH)).toBe(
      collapsed.displayText.slice(0, -3)
    );
  });

  // CASE 9: a very long caption never throws or produces an unbounded
  // result - collapsed length is always capped at the threshold + "...".
  it("a very long caption (thousands of characters) is handled without error", () => {
    const huge = "word ".repeat(2000); // 10,000 chars
    const collapsed = getCaptionDisplayState(huge, false);
    const expanded = getCaptionDisplayState(huge, true);
    expect(collapsed.displayText.length).toBe(SHORTS_CAPTION_TRUNCATE_LENGTH + 3);
    expect(expanded.displayText.length).toBe(huge.length);
  });

  it("an empty caption is never treated as long", () => {
    const result = getCaptionDisplayState("", false);
    expect(result.isLong).toBe(false);
    expect(result.displayText).toBe("");
  });
});

describe("Shorts page - caption wiring (source guards)", () => {
  const shorts = fs.readFileSync(
    path.join(process.cwd(), "src/app/shorts/page.tsx"),
    "utf8"
  );

  it("renders the caption via getCaptionDisplayState, not CSS line-clamp", () => {
    expect(shorts).toContain(
      'import { getCaptionDisplayState } from "@/lib/shortsCaption"'
    );
    expect(shorts).toContain("getCaptionDisplayState(");
  });

  it("never reintroduces the broken line-clamp/fixed-height truncation this replaced", () => {
    // The exact classes the old, buggy implementation used - a line
    // clamp for "collapsed" and a small fixed max-height for "expanded" -
    // must not come back for this caption.
    expect(shorts).not.toMatch(/line-clamp-\d/);
    expect(shorts).not.toContain("max-h-40");
  });

  it("shows a real Show less label once expanded, not just an unlabeled toggle", () => {
    expect(shorts).toContain('"rightPanel.showLess"');
    expect(shorts).toContain('"rightPanel.showMore"');
  });

  // CASE 5 / 6: per-Short state, keyed by post id, reset on remount - so
  // an expanded caption never leaks to another Short or across a
  // navigate-away-and-back (a fresh mount resets React state to {}).
  it("keeps expansion state keyed per post id, not a single shared flag", () => {
    expect(shorts).toMatch(
      /captionExpanded,\s*setCaptionExpanded\s*\]\s*=\s*\n?\s*useState<Record<string, boolean>>\(\{\}\)/
    );
    expect(shorts).toMatch(/captionExpanded\[\s*post\.id\s*\]/);
  });

  // CASE 10: a real <button>, not a bare clickable <div>/<span>, so touch
  // targets on mobile/PWA are genuinely tappable and screen-reader
  // accessible - unchanged by this fix, guarded so it stays that way.
  it("the caption disclosure is a real button, not a bare clickable div", () => {
    const captionBlockStart = shorts.indexOf("getCaptionDisplayState(");
    const captionBlockEnd = shorts.indexOf("})()}", captionBlockStart);
    const block = shorts.slice(captionBlockStart, captionBlockEnd);
    expect(block).toContain("<button");
    expect(block).toContain('type="button"');
  });
});
