import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { SUPPORTED_LANGUAGES } from "@/lib/translations";

// Regression test for the language-selector overflow bug: with 25
// languages (post EU Wave 1), every `SUPPORTED_LANGUAGES.map()` popover
// grew to its full unbounded content height (~1100px) with no
// max-height/overflow-y-auto pairing, so on any viewport shorter than
// that (iPad, mobile, most laptops) the tail of the list rendered off
// the visible viewport with no way to scroll to it.
//
// No jsdom/RTL in this project (vitest runs "node" only, see
// vitest.config.ts and mobile-sidebar-scroll.test.ts's own note on the
// same constraint) - this asserts at the source level: every list
// still renders the complete, untruncated language array, and every
// container it renders into is both height-bounded and internally
// scrollable, not just given `overflow-hidden` for corner-clipping.

const headerSource = readFileSync(
  path.resolve(__dirname, "../Header.tsx"),
  "utf-8"
);
const sidebarSource = readFileSync(
  path.resolve(__dirname, "../Sidebar.tsx"),
  "utf-8"
);

function menuBlockAfter(source: string, marker: string, span = 2200): string {
  const idx = source.indexOf(marker);
  expect(idx, `expected to find marker "${marker}"`).toBeGreaterThan(-1);
  return source.slice(idx, idx + span);
}

describe("language menus never truncate the supported-language list", () => {
  it("SUPPORTED_LANGUAGES has not been reduced (still the full EU Wave 1 set)", () => {
    expect(SUPPORTED_LANGUAGES.length).toBeGreaterThanOrEqual(25);
  });

  it("Header's desktop dropdown maps the full array with no slice/filter truncation", () => {
    const block = menuBlockAfter(headerSource, "DESKTOP LANGUAGE");
    expect(block).toMatch(/SUPPORTED_LANGUAGES\.map\(/);
    expect(block).not.toMatch(/SUPPORTED_LANGUAGES\.(slice|filter)\(/);
  });

  it("Header's mobile drawer language section maps the full array with no truncation", () => {
    const block = menuBlockAfter(headerSource, "{/* LANGUAGE */}", 2000);
    expect(block).toMatch(/SUPPORTED_LANGUAGES\.map\(/);
    expect(block).not.toMatch(/SUPPORTED_LANGUAGES\.(slice|filter)\(/);
  });

  it("Sidebar's flyout maps the full array with no truncation", () => {
    const idx = sidebarSource.indexOf("SUPPORTED_LANGUAGES.map");
    expect(idx).toBeGreaterThan(-1);
    const block = sidebarSource.slice(idx - 400, idx + 200);
    expect(block).not.toMatch(/SUPPORTED_LANGUAGES\.(slice|filter)\(/);
  });
});

describe("language menus are height-bounded and internally scrollable", () => {
  it("Header's desktop popover pairs a viewport-relative max-height with overflow-y-auto (not overflow-hidden alone)", () => {
    const block = menuBlockAfter(headerSource, "DESKTOP LANGUAGE");
    expect(block).toMatch(/max-h-\[min\(60dvh,24rem\)\]/);
    expect(block).toMatch(/overflow-y-auto/);
    expect(block).toMatch(/overscroll-contain/);
  });

  it("Header's mobile drawer language list is its own bounded, scrollable region (not just relying on the whole drawer scrolling)", () => {
    const idx = headerSource.indexOf("{/* LANGUAGE */}");
    expect(idx).toBeGreaterThan(-1);
    const block = headerSource.slice(idx, idx + 2000);
    expect(block).toMatch(/max-h-\[40dvh\]/);
    expect(block).toMatch(/overflow-y-auto/);
    expect(block).toMatch(/overscroll-contain/);
  });

  it("Sidebar's flyout computes maxHeight from the trigger's real position, not a hardcoded device height", () => {
    expect(sidebarSource).toMatch(
      /maxHeight:\s*Math\.max\(rect\.top\s*-\s*16,\s*160\)/
    );
    expect(sidebarSource).not.toMatch(/maxHeight:\s*\d+,?\s*\/\/.*(iPad|iPhone|Android)/i);
  });

  it("Sidebar's flyout applies that computed maxHeight and switches from overflow-hidden to overflow-y-auto", () => {
    const idx = sidebarSource.indexOf("langMenuPos.maxHeight");
    expect(idx).toBeGreaterThan(-1);
    const block = sidebarSource.slice(idx - 300, idx + 400);
    expect(block).toMatch(/overflow-y-auto/);
    expect(block).not.toMatch(/overflow-hidden/);
  });

  it("Sidebar's flyout recalculates its bound on resize/orientation change while open (survives keyboard, rotation, browser-chrome changes)", () => {
    expect(sidebarSource).toMatch(/addEventListener\("resize",\s*positionLangMenu\)/);
    expect(sidebarSource).toMatch(
      /addEventListener\("orientationchange",\s*positionLangMenu\)/
    );
  });
});

describe("language menus stay reachable by keyboard and screen readers", () => {
  it("every language popover is a labelled role=menu of role=menuitem buttons", () => {
    for (const source of [headerSource, sidebarSource]) {
      const menuItemMatches = source.match(/role="menuitem"/g) ?? [];
      expect(menuItemMatches.length).toBeGreaterThan(0);
    }
    const roleMenuMatches = headerSource.match(/role="menu"/g) ?? [];
    expect(roleMenuMatches.length).toBe(2); // desktop dropdown + mobile drawer section
  });
});
