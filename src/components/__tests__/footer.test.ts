import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { SUPPORTED_LANGUAGES } from "@/lib/translations";

/**
 * Guards for the site footer.
 *
 * The footer is a single flat row of links - like X's own footer - not
 * a grouped mega-menu. These guards exist because that shape is easy to
 * regress back into columns/headings, and because the footer makes two
 * promises nothing else in the app would notice breaking:
 *
 *  - Every href must resolve to a real page. A footer link to a route
 *    that was renamed or removed is a 404 that no user reports, because
 *    nobody complains about a footer - they just quietly find out the
 *    company page is broken.
 *
 *  - Every label must exist in every supported language. The footer was
 *    built entirely out of strings that already existed (footer.*, nav.*
 *    and help.footer.*), so this is also what stops someone "fixing" a
 *    label later by inventing a key with English-only fallbacks.
 *
 * vitest runs with environment: "node" (see vitest.config.ts), so there
 * is no DOM to mount into; these assert on the source, matching the
 * pattern in poll-render-regressions.test.ts.
 */

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

const FOOTER = "src/components/Footer.tsx";
const LAYOUT = "src/app/layout.tsx";

const src = read(FOOTER);

/** The file documents the very things being asserted; assert on code. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** tsconfig targets ES5 here, so no spreading of iterators. */
const collect = (re: RegExp) => {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) out.push(m[1]);
  return out;
};
const unique = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) === i);

const hrefs = collect(/href:\s*"([^"]+)"/g);
const keys = collect(/\bt\("([^"]+)"\)/g);

describe("Footer is wired into the shared layout", () => {
  const layout = read(LAYOUT);

  it("is imported and rendered once by the root layout", () => {
    expect(layout).toMatch(/import Footer from "@\/components\/Footer"/);
    expect(layout.match(/<Footer \/>/g) || []).toHaveLength(1);
  });

  it("sits inside the app shell that reserves room for BottomNav", () => {
    // layout.tsx pads .app-shell-clip by 3.5rem + safe-area-inset-bottom
    // on phones. A footer rendered outside that wrapper would end up
    // underneath the fixed bottom navigation.
    const shell = layout.indexOf("app-shell-clip");
    const footer = layout.indexOf("<Footer />");
    const close = layout.lastIndexOf("</body>");
    expect(shell).toBeGreaterThan(-1);
    expect(footer).toBeGreaterThan(shell);
    expect(footer).toBeLessThan(close);
  });
});

describe("Footer is one flat row, not a grouped mega-menu", () => {
  it("renders a single <nav> with a single flat <ul>, not several", () => {
    expect((code.match(/<nav /g) || []).length).toBe(1);
    expect((code.match(/<ul /g) || []).length).toBe(1);
  });

  it("has no column headings or grouping structure", () => {
    // The earlier version grouped links under uppercase headings
    // ("Company", "Platform", "Legal", "Community"). None of that
    // structure - separate group objects, per-group headings - should
    // come back.
    expect(code).not.toMatch(/groups\s*[:=]/);
    expect(code).not.toContain("companyHeading\"),\n");
    expect(code).not.toMatch(/uppercase tracking-wider/);
  });

  it("lists only corporate/legal links, not product features", () => {
    // Marketplace, Music, Play, Opportunity and ZRP AI already have
    // entry points in Header/Sidebar/BottomNav - a footer isn't where
    // a user finds a product surface, only the company/legal pages.
    for (const productHref of ["/marketplace", "/music", "/play", "/opportunity", "/ai"]) {
      expect(hrefs).not.toContain(productHref);
    }
  });
});

describe("Footer links point at real pages", () => {
  it("lists a reasonably small, X-sized set of links", () => {
    // X's own footer runs about a dozen items in one row. This stays in
    // that neighbourhood rather than creeping back up toward 18+.
    expect(hrefs.length).toBeGreaterThanOrEqual(8);
    expect(hrefs.length).toBeLessThanOrEqual(15);
  });

  // de-duplicated so a repeated href doesn't report twice
  it.each(unique(hrefs).map((h) => [h] as [string]))(
    "%s resolves to a page under src/app",
    (href) => {
      expect(href.startsWith("/")).toBe(true);
      // No dynamic segments in the footer - every destination is static.
      expect(href).not.toContain("[");
      expect(fs.existsSync(path.join(root, "src/app", href, "page.tsx"))).toBe(true);
    },
  );
});

describe("Footer labels exist in every language", () => {
  const dict = read("src/lib/translations.ts");

  it("uses only translated strings, no inline English", () => {
    // Every visible label goes through t(). The only literal text in the
    // markup is the copyright's "ZRP", which is the brand name.
    expect(keys.length).toBeGreaterThanOrEqual(hrefs.length);
  });

  const languageCount = SUPPORTED_LANGUAGES.length;
  it.each(unique(keys).map((k) => [k] as [string]))(
    `%s is defined in all ${languageCount} language blocks`,
    (key) => {
      const occurrences = dict.split(`"${key}":`).length - 1;
      expect(occurrences).toBe(languageCount);
    },
  );
});

describe("Footer stays out of the way where it would break a screen", () => {
  it("renders nothing on the immersive routes", () => {
    expect(code).toContain('"/shorts"');
    expect(code).toContain('"/messages"');
    expect(code).toContain('"/admin"');
    expect(code).toMatch(/if\s*\(isImmersive\)\s*return null/);
    // Prefix match, so /messages/alice and /admin/users are covered too.
    expect(code).toMatch(/startsWith\(`\$\{route\}\/`\)/);
  });
});

describe("Footer copyright", () => {
  it("shows the current year rather than a year baked into the source", () => {
    expect(code).toContain("new Date().getFullYear()");
    expect(code).not.toMatch(/©\s*20\d\d/);
  });

  it("carries the Swiss flag with an accessible name", () => {
    expect(code).toContain("🇨🇭");
    expect(code).toMatch(/aria-label="Switzerland"/);
  });
});

describe("Footer accessibility structure", () => {
  it("is a labelled contentinfo landmark", () => {
    expect(code).toContain('role="contentinfo"');
    expect(code).toMatch(/<nav aria-label=\{t\(/);
    expect(code).toContain("<ul");
    expect(code).toContain("<li");
  });

  it("sizes touch targets by pointer type, not by viewport width", () => {
    // An iPad at 820px is a finger and a narrow desktop window is not,
    // so a width breakpoint gets both wrong.
    expect(code).toContain("[@media(pointer:coarse)]:min-h-11");
    expect(code).not.toMatch(/sm:min-h-0/);
  });
});
