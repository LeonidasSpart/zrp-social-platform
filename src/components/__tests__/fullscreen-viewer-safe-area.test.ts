import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Regression guard for the Stories/Shorts close-button-under-the-status-bar
 * bug.
 *
 * src/app/shorts/__tests__/pwa-safe-area.test.ts already documents and
 * guards the fix on src/app/shorts/page.tsx: layout.tsx sets viewportFit:
 * "cover", so in an installed standalone PWA the viewport starts *under*
 * the system status bar / notch / Dynamic Island and
 * env(safe-area-inset-top) becomes non-zero there. Any top chrome that is
 * a direct child of a `fixed inset-0` overlay and positioned at a bare
 * `top-4`/`top-0` draws inside that status bar.
 *
 * That same fix had only ever been applied to shorts/page.tsx. Two other
 * fullscreen viewers with the identical shape - StoryViewer.tsx (Stories)
 * and VideoFeedViewer.tsx (the separate video viewer opened by tapping a
 * video post in the feed, distinct from the /shorts tab) - still had their
 * close (and, for VideoFeedViewer, mute) buttons at a bare offset. This
 * file guards both fixes so they can't silently regress back to a bare
 * offset the way they were found.
 *
 * vitest runs environment: "node" here (see vitest.config.ts) and collects
 * only *.test.ts, so there is no DOM and no way to synthesise a non-zero
 * safe-area inset. These are source guards on the one CSS property that
 * decides it, matching the pattern already established in
 * src/app/shorts/__tests__/pwa-safe-area.test.ts.
 */

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

const STORY_VIEWER = "src/components/StoryViewer.tsx";
const VIDEO_FEED_VIEWER = "src/components/VideoFeedViewer.tsx";

describe("StoryViewer close button respects the status bar in a standalone PWA", () => {
  const src = read(STORY_VIEWER);

  it("insets the close button by env(safe-area-inset-top) instead of a bare offset", () => {
    expect(src).toContain("top-[calc(1rem+env(safe-area-inset-top))]");
  });

  it("gives the close button a real, padded hit area of at least 44px", () => {
    // The bug report was two bugs in one control: a bare top-4 AND a
    // padding-less 32px icon as the entire hit area. rounded-full + p-2
    // around a w-8 h-8 icon is 48px - above this repo's 44px floor.
    const closeButton = src.slice(
      src.indexOf("onClick={onClose}"),
      src.indexOf("</button>", src.indexOf("onClick={onClose}")),
    );
    expect(closeButton).toContain("rounded-full");
    expect(closeButton).toMatch(/\bp-2\b/);
  });

  it("degrades to the exact offset the browser/iPad case already had", () => {
    // Web, native WebView and iPad resolve the inset to 0, so
    // calc(1rem + 0px) = 16px - byte for byte the original top-4.
    expect(src).not.toContain("top-4 right-4");
  });
});

describe("VideoFeedViewer top chrome respects the status bar in a standalone PWA", () => {
  const src = read(VIDEO_FEED_VIEWER);

  it("insets every piece of top chrome (loading-state close, close, mute) by the safe area", () => {
    const inset = src.match(/top-\[calc\(1rem\+env\(safe-area-inset-top\)\)\]/g);
    expect(inset).not.toBeNull();
    expect(inset!.length).toBe(3);
  });

  it("leaves no top chrome at the old bare offset", () => {
    expect(src).not.toMatch(/absolute top-4 right-4/);
    expect(src).not.toMatch(/absolute top-4 left-4/);
  });
});
