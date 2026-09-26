import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Structural regression guards for "tap a profile photo to view it
 * full-size" (previously: tapping any profile photo did nothing).
 *
 * vitest here runs with environment: "node" (see vitest.config.ts) -
 * there is no DOM to render into, so these assert on the source
 * instead, matching the convention in profile-regressions.test.ts.
 */

const read = (p: string) =>
  fs.readFileSync(path.join(process.cwd(), p), "utf8");

const LIGHTBOX = "src/components/ui/ImageLightbox.tsx";
const POST_CARD = "src/components/PostCard.tsx";
const PROFILE = "src/app/profile/[username]/page.tsx";

describe("ImageLightbox component", () => {
  const src = read(LIGHTBOX);

  it("renders nothing when there is no image to show (and nothing on the server, where it has no <body> to portal into)", () => {
    expect(src).toContain('if (!src || typeof document === "undefined") return null;');
  });

  it("closes on Escape and an explicit close button", () => {
    expect(src).toContain('case "Escape":');
    expect(src).toContain("onClick={requestClose}");
  });

  it("is portalled onto <body> above every shell layer, instead of being flattened into its caller's stacking context", () => {
    // Inline, the profile header's `relative z-10` wrapper (and a
    // PostCard's article) capped the `fixed` overlay below the sticky
    // Header (z-50), the cookie banner (z-50), BottomNav (z-[9999]) and
    // the music mini player (z-[9998]): the image opened, but the shell
    // drew over it and over its close button.
    expect(src).toContain('import { createPortal } from "react-dom"');
    expect(src).toContain("document.body\n  );");
    expect(src).toMatch(/z-\[10000\]/);
  });

  it("closes on the Back button via one history entry, and closes by every other route through that same entry", () => {
    expect(src).toContain('window.history.pushState({ [HISTORY_KEY]: true }, "")');
    expect(src).toContain('window.addEventListener("popstate", handlePopState)');
    // requestClose goes back through the pushed entry (so the entry is
    // consumed, never left stale), and only calls onClose directly when
    // there is no such entry to go back through.
    const idx = src.indexOf("const requestClose");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 500);
    expect(block).toContain("window.history.back()");
    expect(block).toContain("if (!viaHistory) onCloseRef.current()");
  });

  it("supports pinch/drag on touch, wheel on desktop, double-tap and keyboard zoom, clamped to a sane range", () => {
    expect(src).toContain("onPointerDown={handlePointerDown}");
    expect(src).toContain("onPointerMove={handlePointerMove}");
    expect(src).toContain("onPointerUp={handlePointerUp}");
    expect(src).toContain("onPointerCancel={handlePointerUp}");
    // touch-none: otherwise the browser's own pinch-zoom/scroll eats the gesture.
    expect(src).toMatch(/touch-none/);
    // Native, non-passive wheel listener - React's onWheel is passive and cannot preventDefault.
    expect(src).toContain('stage.addEventListener("wheel", handleWheel, { passive: false })');
    expect(src).toContain("const MIN_SCALE = 1;");
    expect(src).toContain("const MAX_SCALE = 4;");
    expect(src).toContain('aria-label={t("ambassadors.map.zoomIn")}');
    expect(src).toContain('aria-label={t("ambassadors.map.zoomOut")}');
  });

  it("never captures the pointer for its own buttons (capture would retarget their click to the stage)", () => {
    const idx = src.indexOf("const handlePointerDown");
    const block = src.slice(idx, idx + 400);
    expect(block).toContain('closest("button")) return;');
  });

  it("moves focus to the close button on open and returns it to the opener on close", () => {
    expect(src).toContain("closeButtonRef.current?.focus()");
    expect(src).toContain("openerRef.current = document.activeElement");
  });

  it("positions its controls with logical (RTL-safe) inset classes", () => {
    expect(src).not.toMatch(/\b(sm:)?(left|right)-\d/);
    expect(src).toMatch(/\bend-1\b/);
  });

  it("only closes a backdrop click when the click lands directly on the backdrop, never bubbled from a descendant", () => {
    // The standard, bulletproof pattern: event.target === event.currentTarget.
    // A manual click-target check during review found the alternative
    // (stopPropagation on the content wrapper, closing on everything
    // else) unreliable here - the content wrapper's own sizing left far
    // less real backdrop margin around it than intended, so a "backdrop"
    // click could still land on the wrapper itself.
    expect(src).toContain("event.target === event.currentTarget");
    expect(src).toContain("handleBackdropClick");
  });

  it("does not close a second time from the close button's own click bubbling up", () => {
    // The close button calls onClose() directly and needs no
    // stopPropagation of its own: event.target there is the button, not
    // the backdrop div, so handleBackdropClick's own target check
    // already excludes it.
    const btnIdx = src.indexOf('aria-label={t("post.closeImageAria")}');
    expect(btnIdx).toBeGreaterThan(-1);
    expect(src.slice(Math.max(0, btnIdx - 100), btnIdx)).toContain("onClick={requestClose}");
  });

  it("has a real loading state and a real error state, not just the bare image", () => {
    expect(src).toContain('"loading"');
    expect(src).toContain('"error"');
    expect(src).toContain("onError={() => setStatus(\"error\")}");
    expect(src).toContain('t("explore.errFailedLoad")');
  });

  it("locks background scroll while open, matching every other full-screen overlay", () => {
    expect(src).toContain("useBodyScrollLock(src !== null)");
  });

  it("gives the dialog and the close button real accessible names", () => {
    expect(src).toContain('role="dialog"');
    expect(src).toContain('aria-modal="true"');
    expect(src).toContain("aria-label={alt}");
    expect(src).toContain('aria-label={t("post.closeImageAria")}');
  });
});

describe("PostCard feed avatar", () => {
  const src = read(POST_CARD);

  it("opens the lightbox instead of only ever being a profile link", () => {
    const idx = src.indexOf("{/* AVATAR");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 1200);
    expect(block).toContain("setAvatarLightboxOpen(true)");
    expect(block).toContain('aria-label={t("profile.viewPhotoAria"');
  });

  it("keeps a working profile link for the no-avatar (initials) case", () => {
    const idx = src.indexOf("{/* AVATAR");
    const block = src.slice(idx, idx + 1600);
    expect(block).toContain("href={`/profile/${post.author.username}`}");
  });

  it("leaves the display name/username as a real, independent link to the profile", () => {
    // The avatar no longer navigates directly - this is what still does,
    // and it must keep doing so: this is a separate <Link>, not nested
    // inside the avatar's new button.
    const idx = src.indexOf("{/* HEADER");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 1200);
    expect(block).toContain("href={`/profile/${post.author.username}`}");
  });

  it("renders the shared ImageLightbox for the author's avatar", () => {
    expect(src).toContain('import { ImageLightbox } from "@/components/ui/ImageLightbox"');
    const idx = src.indexOf("{/* AVATAR LIGHTBOX */}");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toContain("avatarLightboxOpen");
    expect(block).toContain("post.author.avatarUrl");
  });
});

describe("profile page's own avatar and banner", () => {
  const src = read(PROFILE);

  it("opens the lightbox for the avatar regardless of whose profile it is", () => {
    // One tap target for everyone, own profile included - previously
    // only someone else's avatar was clickable at all, since a
    // full-cover "change avatar" button sat on top of the whole image
    // on your own profile and intercepted every click underneath.
    const idx = src.indexOf("profile.avatarUrl ? (");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 900);
    expect(block).toContain("setAvatarLightboxOpen(true)");
    expect(block).toContain('aria-label={t("profile.viewPhotoAria"');
  });

  it("moves the owner's own change-avatar control to a small corner badge that stops its click from also opening the viewer", () => {
    const idx = src.indexOf("avatarInputRef.current?.click()");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(Math.max(0, idx - 200), idx);
    expect(block).toContain("e.stopPropagation()");
  });

  it("renders the shared ImageLightbox for the avatar, ungated by ownership", () => {
    expect(src).toContain('import { ImageLightbox } from "@/components/ui/ImageLightbox"');
    const idx = src.indexOf("avatarLightboxOpen\n              ? profile.avatarUrl");
    expect(idx).toBeGreaterThan(-1);
  });

  it("opens the lightbox for the cover/banner for everyone, when a cover exists", () => {
    const idx = src.indexOf("{profile.coverUrl && (");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 700);
    expect(block).toContain("setBannerLightboxOpen(true)");
    // Its own name - "View {name}'s photo" twice on one page (avatar and
    // banner) left screen-reader users unable to tell the two apart.
    expect(block).toContain('aria-label={t("profile.viewCoverAria"');
    // The <img> inside is decorative: the button already carries the
    // name, and the old untranslated alt="Cover" was read on top of it
    // (and drawn as stray text while the photo was unreachable).
    expect(block).toContain('alt=""');
  });

  it("moves the owner's own change-banner control to a small corner badge that stops its click from also opening the viewer", () => {
    const idx = src.indexOf("bannerInputRef.current?.click()");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(Math.max(0, idx - 200), idx);
    expect(block).toContain("e.stopPropagation()");
  });

  it("renders the shared ImageLightbox for the banner, ungated by ownership", () => {
    const idx = src.indexOf("bannerLightboxOpen\n              ? profile.coverUrl");
    expect(idx).toBeGreaterThan(-1);
  });
});
