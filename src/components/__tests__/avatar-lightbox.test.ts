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

  it("renders nothing when there is no image to show", () => {
    expect(src).toContain("if (!src) return null;");
  });

  it("closes on Escape and an explicit close button", () => {
    expect(src).toContain('event.key === "Escape"');
    expect(src).toContain("onClick={onClose}");
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
    expect(src.slice(Math.max(0, btnIdx - 100), btnIdx)).toContain("onClick={onClose}");
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
    expect(block).toContain('aria-label={t("profile.viewPhotoAria"');
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
