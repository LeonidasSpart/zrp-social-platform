import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/*
 * Regression guard for a real bug caught while manually verifying this
 * feature: src/middleware.ts redirects every route to /login by
 * default unless it's explicitly listed in PUBLIC_PATHS - a brand-new
 * page route is not public by default, it has to be added. /ambassadors
 * was missing from that list, so the entire public "world-class global
 * experience" this feature exists to build was invisible to every
 * signed-out visitor, silently redirected to /login before ZRP's own
 * React code ever ran. /ambassadors/apply and /ambassadors/dashboard
 * are covered too (PUBLIC_PATHS matching is prefix-based - path === p
 * or path.startsWith(p + "/")) and don't need their own separate
 * entries; both pages already render their own "sign in to continue"
 * state for a signed-out visitor once they're actually allowed to load.
 */
const middlewareSrc = fs.readFileSync(
  path.join(process.cwd(), "src/middleware.ts"),
  "utf8",
);

describe("/ambassadors is publicly reachable", () => {
  it("is listed in PUBLIC_PATHS so signed-out visitors aren't redirected to /login", () => {
    const start = middlewareSrc.indexOf("const PUBLIC_PATHS = [");
    const end = middlewareSrc.indexOf("];", start);
    expect(start).toBeGreaterThan(-1);
    const publicPathsBlock = middlewareSrc.slice(start, end);
    expect(publicPathsBlock).toMatch(/"\/ambassadors"/);
  });
});

describe("World map does not trap keyboard focus", () => {
  const worldMapSrc = fs.readFileSync(
    path.join(process.cwd(), "src/components/ambassadors/WorldMap.tsx"),
    "utf8",
  );

  it("does not put individual country shapes in the tab order", () => {
    // Regression: with up to ~235 individually-focusable country
    // shapes, Tab had to walk every single one before ever reaching
    // the Country Explorer's search input below the map - caught live
    // in manual keyboard-only QA. Every <Geography> must be tabIndex=-1;
    // the map's own aria-label on <ComposableMap> plus the fully
    // keyboard-accessible Explorer are the real accessible path in.
    expect(worldMapSrc).toMatch(/tabIndex=\{-1\}/);
    expect(worldMapSrc).not.toMatch(/tabIndex=\{resolvable \? 0/);
  });

  it("marks the per-country shapes as decorative to assistive tech", () => {
    expect(worldMapSrc).toContain('aria-hidden="true"');
  });

  it("still lets a screen reader identify the map as a whole", () => {
    expect(worldMapSrc).toMatch(/role="img"/);
    expect(worldMapSrc).toContain('aria-label={t("ambassadors.map.ariaLabel")}');
  });
});
