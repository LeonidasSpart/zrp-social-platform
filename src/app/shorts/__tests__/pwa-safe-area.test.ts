import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Mobile-PWA Shorts layout.
 *
 * layout.tsx sets viewportFit: "cover", so in an installed standalone
 * PWA the viewport starts at y=0 *underneath* the system status bar and
 * env(safe-area-inset-top) becomes non-zero. Any fullscreen overlay that
 * positions its chrome at a bare offset therefore draws inside the
 * status bar. That is what happened on Shorts: the back arrow, the
 * "Shorts" title and the upload/mute buttons were rendered across the
 * clock and the battery icons on Android and iPhone PWAs.
 *
 * An ordinary mobile browser hides it, because the address bar already
 * pushes the viewport clear of the status bar; iPad hides it because the
 * inset is 0 there. Both keep working after the fix for the same reason
 * - calc(1rem + 0px) is exactly the 16px they had.
 *
 * vitest runs environment: "node" here and collects only *.test.ts, so
 * there is no DOM and no way to synthesise a non-zero safe-area inset
 * (Chromium does not expose env() overrides either). These are source
 * guards on the one property that decides it; the zero-inset case was
 * measured in a real browser and is unchanged at 16px.
 */

const shorts = fs.readFileSync(
  path.join(process.cwd(), "src/app/shorts/page.tsx"),
  "utf8",
);

// Class strings only - the surrounding prose explains the same thing and
// would otherwise trip every assertion below.
const classes = (shorts.match(/className="[^"]*"/g) || []).join("\n");

describe("Shorts overlay respects the status bar in a standalone PWA", () => {
  it("insets every piece of top chrome by env(safe-area-inset-top)", () => {
    // Back button, title and the top-right action cluster are each
    // absolutely positioned against a `fixed inset-0` container, so a
    // padding on that container cannot move them - each must carry the
    // inset itself.
    const inset = classes.match(
      /top-\[calc\(1rem\+env\(safe-area-inset-top\)\)\]/g,
    );
    expect(inset).not.toBeNull();
    expect(inset!.length).toBe(3);
  });

  it("leaves no top chrome at a bare offset", () => {
    // A bare top-4 / top-0 on this screen is the bug: correct in a
    // browser, under the status bar in a PWA.
    expect(classes).not.toMatch(/absolute top-4\b/);
    expect(classes).not.toMatch(/absolute top-0\b/);
  });

  it("centres the video inside the area the chrome actually leaves", () => {
    // Both insets, so the frame is centred in what is visible rather
    // than behind the status bar above or BottomNav below.
    expect(classes).toContain("pt-[calc(4rem+env(safe-area-inset-top))]");
    expect(classes).toContain("pb-[calc(3.5rem+env(safe-area-inset-bottom))]");
  });

  it("keeps the author row clear of the persistent BottomNav", () => {
    // BottomNav is a z-[9999] portal above this z-[100] overlay, so the
    // overlay reserves its real footprint rather than a guessed padding.
    expect(classes).toContain(
      "pb-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)]",
    );
  });

  it("degrades to the exact offsets the working surfaces already had", () => {
    // Web, native WebView and iPad all resolve these insets to 0, so
    // calc(1rem + 0px) = 16px and calc(4rem + 0px) = 64px - byte for
    // byte the layout those platforms shipped with. This is what makes
    // the fix safe for the three surfaces that were already correct.
    expect(classes).not.toContain("top-[16px]");
    expect(classes).not.toContain("pt-16 ");
  });
});

describe("the PWA viewport is configured for edge-to-edge", () => {
  const layout = fs.readFileSync(
    path.join(process.cwd(), "src/app/layout.tsx"),
    "utf8",
  );

  it("keeps viewport-fit=cover", () => {
    // Without it env(safe-area-inset-*) is 0 everywhere and every
    // safe-area inset in the app silently stops doing anything.
    expect(layout).toMatch(/viewportFit:\s*"cover"/);
  });
});
