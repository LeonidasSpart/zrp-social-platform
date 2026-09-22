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

  it("closes on backdrop click, Escape, and an explicit close button", () => {
    expect(src).toContain('onClick={onClose}');
    expect(src).toContain('event.key === "Escape"');
    expect(src).toContain("onClose()");
  });

  it("lets a tap on the photo itself close the viewer too, not just the backdrop", () => {
    // Mirrors PostCard's own lightbox (see profile-regressions.test.ts's
    // "image lightbox" describe block): the content wrapper must NOT
    // stopPropagation, or a tap almost anywhere in the viewer - the
    // photo included - would silently do nothing, since that wrapper
    // fills nearly the entire dialog.
    const wrapperIdx = src.indexOf('className="relative flex h-full max-h-[92vh]');
    expect(wrapperIdx).toBeGreaterThan(-1);
    const wrapper = src.slice(wrapperIdx, wrapperIdx + 200);
    expect(wrapper).not.toContain("stopPropagation");
  });

  it("stops the close button's own click from double-firing via the bubbled backdrop close", () => {
    const btnIdx = src.indexOf('aria-label={t("post.closeImageAria")}');
    expect(btnIdx).toBeGreaterThan(-1);
    expect(src.slice(Math.max(0, btnIdx - 200), btnIdx)).toContain("event.stopPropagation()");
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

describe("profile page's own avatar", () => {
  const src = read(PROFILE);

  it("opens the lightbox for a profile that is not the viewer's own", () => {
    const idx = src.indexOf("isOwnProfile ? (");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 900);
    expect(block).toContain("setAvatarLightboxOpen(true)");
    expect(block).toContain('aria-label={t("profile.viewPhotoAria"');
  });

  it("leaves the owner's own avatar as the existing change-photo control, untouched", () => {
    // isOwnProfile still gets a plain <img>, so the pre-existing
    // hover-camera "change avatar" button (isOwnProfile-gated, further
    // below) keeps the whole avatar as its hit area exactly as before -
    // this fix does not touch that flow.
    const idx = src.indexOf("isOwnProfile ? (");
    const block = src.slice(idx, idx + 400);
    expect(block).toContain("<img");
    expect(src).toContain("avatarInputRef.current?.click()");
  });

  it("renders the shared ImageLightbox, gated to other people's profiles", () => {
    expect(src).toContain('import { ImageLightbox } from "@/components/ui/ImageLightbox"');
    const idx = src.indexOf("{!isOwnProfile && (\n          <ImageLightbox");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toContain("avatarLightboxOpen");
    expect(block).toContain("profile.avatarUrl");
  });
});
