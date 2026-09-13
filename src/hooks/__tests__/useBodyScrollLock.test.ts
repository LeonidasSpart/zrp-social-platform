import { describe, it, expect, beforeEach, vi } from "vitest";
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
    expect(hook).toContain("window.scrollTo(0, savedBodyState.scrollY)");
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

/*
 * Regression coverage for a real concurrent-consumer bug found in a
 * forensic re-audit: PostCard's lightbox and the VideoFeedViewer it
 * renders as a child can both be locking body scroll at the same time
 * (independent `lightboxOpen`/`showVideoFeed` state, no mutual
 * exclusion). The original implementation captured and restored
 * `document.body.style` per call with no shared coordination, so
 * whichever consumer unmounted FIRST - not necessarily the one that
 * locked LAST - restored the body to its own "before" snapshot, which
 * for the second lock was already the first lock's locked state:
 * closing the lightbox while the video viewer was still open silently
 * un-froze the page underneath it.
 *
 * `useBodyScrollLock` itself is untestable here without React/jsdom
 * (this project runs vitest with environment: "node", see the comment
 * atop this file), so this exercises the module-level
 * lockBodyScroll/unlockBodyScroll reference-counting functions
 * directly against a minimal faked `document`/`window`, dynamically
 * re-imported per test (`vi.resetModules()`) so each test starts from
 * a clean lockCount.
 */
describe("body scroll lock reference counting (two simultaneous consumers)", () => {
  function fakeDom(initialScrollY: number) {
    const body = { style: { overflow: "", position: "", top: "", width: "" } };
    const scrollTo = vi.fn();
    (globalThis as any).document = { body };
    (globalThis as any).window = { scrollY: initialScrollY, scrollTo };
    return { body, scrollTo };
  }

  beforeEach(() => {
    vi.resetModules();
  });

  it("does not unlock the body while a second, still-active consumer holds the lock", async () => {
    const { body, scrollTo } = fakeDom(250);
    const { lockBodyScroll, unlockBodyScroll } = await import("../useBodyScrollLock");

    // Lightbox locks first, capturing the real pre-lock (unlocked) styles.
    lockBodyScroll();
    expect(body.style.overflow).toBe("hidden");
    expect(body.style.position).toBe("fixed");
    expect(body.style.top).toBe("-250px");

    // VideoFeedViewer locks second while the lightbox is still open.
    lockBodyScroll();
    // Still locked - the second lock must not re-capture the already-
    // locked styles as its own "before" snapshot.
    expect(body.style.overflow).toBe("hidden");

    // The FIRST-mounted consumer (the lightbox) unmounts FIRST - not
    // last - while the video viewer is still open.
    unlockBodyScroll();

    // The body must remain locked: one holder still needs it.
    expect(body.style.overflow).toBe("hidden");
    expect(body.style.position).toBe("fixed");
    expect(body.style.top).toBe("-250px");
    expect(scrollTo).not.toHaveBeenCalled();

    // Now the last remaining holder (the video viewer) unmounts.
    unlockBodyScroll();

    // Only now does the body actually restore to its real pre-lock state.
    expect(body.style.overflow).toBe("");
    expect(body.style.position).toBe("");
    expect(body.style.top).toBe("");
    expect(scrollTo).toHaveBeenCalledWith(0, 250);
  });

  it("a single consumer locks and unlocks correctly on its own", async () => {
    const { body, scrollTo } = fakeDom(80);
    const { lockBodyScroll, unlockBodyScroll } = await import("../useBodyScrollLock");

    lockBodyScroll();
    expect(body.style.overflow).toBe("hidden");

    unlockBodyScroll();
    expect(body.style.overflow).toBe("");
    expect(scrollTo).toHaveBeenCalledWith(0, 80);
  });

  it("never drops the lock count below zero on an unbalanced extra unlock", async () => {
    const { body } = fakeDom(0);
    const { lockBodyScroll, unlockBodyScroll } = await import("../useBodyScrollLock");

    lockBodyScroll();
    unlockBodyScroll();
    // An extra, unbalanced unlock (e.g. a defensive double-cleanup) must
    // not underflow the counter and corrupt a LATER, unrelated lock.
    unlockBodyScroll();

    lockBodyScroll();
    expect(body.style.overflow).toBe("hidden");
  });
});
