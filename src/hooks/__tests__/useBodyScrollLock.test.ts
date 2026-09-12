import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/*
 * Regression coverage for a real iOS Safari bug: PostCard's image
 * lightbox and VideoFeedViewer both locked body scroll with a bare
 * `document.body.style.overflow = "hidden"`, which does not actually
 * stop the page scrolling/rubber-banding behind a fullscreen overlay on
 * iOS Safari (the visual viewport there is not the layout viewport, so
 * touch events can still move the body). Both call sites were
 * consolidated onto useBodyScrollLock, which additionally pins the body
 * with `position: fixed` and restores the scroll offset on cleanup -
 * the standard, reliable fix.
 *
 * vitest runs environment: "node" project-wide (see
 * src/app/shorts/__tests__/pwa-safe-area.test.ts's own comment on why -
 * no DOM, no jsdom dependency in this project), so this can't render
 * the components or execute the hook's effect directly. These are
 * source guards on the two things that matter: the buggy raw pattern is
 * gone from both call sites, and both now actually call the shared,
 * iOS-safe hook instead of reimplementing it inline.
 */

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("useBodyScrollLock", () => {
  it("pins the body out of flow and remembers the scroll offset, not just overflow: hidden", () => {
    const hook = read("src/hooks/useBodyScrollLock.ts");
    expect(hook).toContain('body.overflow = "hidden"');
    expect(hook).toContain('body.position = "fixed"');
    expect(hook).toMatch(/body\.top = `-\$\{scrollY\}px`/);
    expect(hook).toContain('body.width = "100%"');
    // Cleanup must restore the real scroll position, not just the styles.
    expect(hook).toContain("window.scrollTo(0, scrollY)");
  });

  it("PostCard's lightbox uses the shared hook, not a raw overflow toggle", () => {
    const source = read("src/components/PostCard.tsx");
    expect(source).toContain("useBodyScrollLock(lightboxOpen)");
    expect(source).not.toContain('document.body.style.overflow = "hidden"');
  });

  it("VideoFeedViewer uses the shared hook, not a raw overflow toggle", () => {
    const source = read("src/components/VideoFeedViewer.tsx");
    expect(source).toContain("useBodyScrollLock(true)");
    expect(source).not.toContain('document.body.style.overflow');
  });
});
