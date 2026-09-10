import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Structural regression guards for the profile experience.
 *
 * vitest here runs with environment: "node" and only picks up *.test.ts
 * (see vitest.config.ts), so there is no DOM to render into and these
 * cannot be behavioural tests. They assert on the source instead, which
 * is enough to catch a reintroduction of each specific bug below - the
 * behaviour itself was verified in a real browser at 320/360/390/430/
 * 1440 with the Playwright harness. If jsdom is ever added, these
 * should be replaced with render-and-click tests.
 */

const read = (p: string) =>
  fs.readFileSync(path.join(process.cwd(), p), "utf8");

const STORY_VIEWER = "src/components/StoryViewer.tsx";
const POST_CARD = "src/components/PostCard.tsx";
const PROFILE = "src/app/profile/[username]/page.tsx";

describe("story author -> profile", () => {
  const src = read(STORY_VIEWER);

  it("renders the author as a real link to their profile", () => {
    expect(src).toContain("href={`/profile/${group.user.username}`}");
  });

  it("lifts the author above the story navigation tap zones", () => {
    // The prev/center/next zones are z-10 and span the full height. An
    // author block at the same z-index loses the hit test to the left
    // zone, which is why tapping the name did nothing at all.
    // Not sliced to the first ">": the onClick arrow function contains
    // one, so the opening tag cannot be found that way.
    const author = src.slice(src.indexOf("href={`/profile/${group.user.username}`}"));
    expect(author.slice(0, 600)).toContain("z-20");
  });

  it("does not let the author tap fall through to story navigation", () => {
    const author = src.slice(src.indexOf("href={`/profile/${group.user.username}`}"));
    expect(author.slice(0, 400)).toContain("stopPropagation");
  });

  it("closes the viewer so the profile is not left under the overlay", () => {
    const author = src.slice(src.indexOf("href={`/profile/${group.user.username}`}"));
    expect(author.slice(0, 400)).toContain("onClose()");
  });
});

describe("post text expansion", () => {
  const src = read(POST_CARD);

  it("stops 'Show more' from bubbling to any ancestor handler", () => {
    const idx = src.indexOf("{/* SHOW MORE */}");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 600);
    expect(block).toContain("stopPropagation");
    expect(block).toContain("setContentExpanded");
  });

  it("never navigates from the expand control", () => {
    const idx = src.indexOf("{/* SHOW MORE */}");
    const block = src.slice(idx, idx + 600);
    // Expanding text is not navigation: no router push, no href, no
    // location assignment may appear in this control.
    expect(block).not.toContain("router.push");
    expect(block).not.toContain("window.location");
    expect(block).not.toContain("href=");
  });

  it("does not make the whole card a link to the author", () => {
    // A card-level navigation handler is what would make any inner
    // control - including Show more - navigate to the profile.
    const root = src.slice(src.indexOf("  return (\n    <>"), src.indexOf("{/* AVATAR */}"));
    expect(root).not.toContain("router.push");
    expect(root).not.toContain("onClick");
  });
});

describe("profile metadata", () => {
  const src = read(PROFILE);

  it("hides each optional field instead of rendering an empty placeholder", () => {
    for (const field of ["profile.location", "profile.website", "profile.bio"]) {
      expect(src).toContain(`{${field} && (`);
    }
    expect(src).toContain("{profile.category &&");
  });

  it("shows the per-account charity figure only when there is one", () => {
    // $0.00 is the real backend value for an account that has never
    // been tipped; printing it on every profile turns a real
    // distinction into noise.
    expect(src).toContain("{charityContributionUsdc > 0 && (");
  });

  it("keeps the Trust Passport a real destination", () => {
    expect(src).toContain("href={`/trust/${profile.username}`}");
  });

  it("reuses the shared verification component rather than a second one", () => {
    expect(src).toContain("VerifiedBadge");
    expect(src).not.toMatch(/badgeType\s*===\s*["']verified["']\s*\?\s*<svg/);
  });

  it("shows the verification badge once, beside the display name only", () => {
    // It was briefly repeated inside the Trust Passport row, where it
    // said nothing the badge next to the name had not already said.
    const trust = src.slice(src.indexOf("profile.trustPassportTitle"));
    expect(trust.slice(0, 400)).not.toContain("VerifiedBadge");
  });

  it("gives the profile tabs real tab semantics", () => {
    expect(src).toContain('role="tablist"');
    expect(src).toContain('role="tab"');
    expect(src).toContain("aria-selected={activeTab === tab}");
  });

  it("keeps action labels visible, so no action is an unnamed icon", () => {
    // `hidden sm:inline` removed the label from the accessible name as
    // well as from the screen, leaving unnamed icon-only buttons at
    // every phone width.
    expect(src).not.toContain('className="hidden sm:inline"');
  });

  it("names the icon-only More trigger and declares its menu", () => {
    expect(src).toContain('aria-label={t("profile.moreActions")}');
    expect(src).toContain('aria-haspopup="menu"');
  });

  it("does not render the composer on a profile", () => {
    expect(src).not.toContain("PostComposer");
  });

  it("renders profile posts with the shared PostCard", () => {
    expect(src).toContain('import PostCard from "@/components/PostCard"');
  });
});

describe("shorts caption", () => {
  const src = read("src/app/shorts/page.tsx");

  it("expands the caption in place instead of navigating", () => {
    const idx = src.indexOf("toggleCaption(post.id)");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(Math.max(0, idx - 400), idx + 200);
    expect(block).toContain("stopPropagation");
    expect(block).not.toContain("router.push");
  });

  it("announces the caption's expanded state", () => {
    expect(src).toContain("aria-expanded={");
    expect(src).toContain('t(\n                                  "rightPanel.showMore"');
  });

  it("reserves BottomNav's real footprint under the overlay", () => {
    // BottomNav is a z-[9999] portal over this z-[100] screen; pb-8 was
    // less than its h-14 + safe-area footprint, so it cut the author row.
    expect(src).toContain("pb-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)]");
  });
});

describe("video feed viewer bottom overlay", () => {
  const src = read("src/components/VideoFeedViewer.tsx");

  it("reserves BottomNav's real footprint under the action rail, matching shorts/page.tsx", () => {
    // Same bug as shorts/page.tsx above, in the sibling full-screen
    // video viewer opened by tapping a video post in the feed: this one
    // still had the old, narrower pb-8, which hid the author row and
    // the like/comment/repost/share action rail behind BottomNav (a
    // z-[9999] portal over this z-[100] viewer) on any route below the
    // lg breakpoint - reported as "the Short menu is invisible" on
    // mobile web/PWA/tablet.
    expect(src).toContain("pb-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)]");
    expect(src).not.toContain('"absolute inset-x-0 bottom-0 p-4 pb-8');
  });
});

describe("image lightbox", () => {
  const src = read(POST_CARD);

  it("clears the system status bar / notch instead of a flat py-4", () => {
    // The close X sat right at/under the status bar on mobile web/PWA
    // (notch/dynamic-island devices, PWA standalone mode) because the
    // header only had a flat py-4 with no safe-area awareness.
    const idx = src.indexOf("aria-label=\"Image gallery\"");
    expect(idx).toBeGreaterThan(-1);
    const header = src.slice(idx, idx + 1500);
    expect(header).toContain("pt-[calc(1rem+env(safe-area-inset-top))]");
  });

  it("closes when the photo itself is tapped, not just the surrounding backdrop", () => {
    // The image-wrapping container was w-full h-full with its own
    // stopPropagation, so a tap almost anywhere in the viewer - the
    // photo included - silently did nothing; only a thin strip of true
    // backdrop outside it actually closed the lightbox. PostCard.tsx
    // has two "Post image" alt templates (the feed gallery thumbnail,
    // and this lightbox) - search from the dialog's own start so this
    // checks the lightbox's <img>, not the thumbnail's.
    const dialogIdx = src.indexOf("aria-label=\"Image gallery\"");
    expect(dialogIdx).toBeGreaterThan(-1);
    const imgIdx = src.indexOf('alt={`Post image ${', dialogIdx);
    expect(imgIdx).toBeGreaterThan(dialogIdx);
    const wrapper = src.slice(Math.max(dialogIdx, imgIdx - 400), imgIdx);
    expect(wrapper).not.toContain("stopPropagation");
  });

  it("still lets the prev/next arrows and header controls swallow their own clicks", () => {
    // Those must keep stopPropagation so pressing them doesn't also
    // close the lightbox out from under the user.
    expect(src).toContain('aria-label="Previous image"');
    const prevIdx = src.indexOf('aria-label="Previous image"');
    expect(src.slice(Math.max(0, prevIdx - 200), prevIdx)).toContain("stopPropagation");
  });
});
