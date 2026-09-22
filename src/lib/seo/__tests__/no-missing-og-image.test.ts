import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Permanent CI gate for the /ambassadors social-sharing bug class:
 * Next.js's Metadata API does not deep-merge `openGraph`/`twitter`
 * objects across nested route segments - a page/layout that defines
 * its own `openGraph` (or `twitter`) block WITHOUT an `images` field
 * does not inherit the root layout's og-image.png, it loses the image
 * entirely. This walks every metadata-exporting file under src/app and
 * fails if any `openGraph`/`twitter` object it finds has no `images`
 * key anywhere inside it - so a future page can't ship the same bug,
 * whether it hand-rolls its own object or (correctly) spreads
 * buildSocialMetadata(...)/uses resolveOgImages(...).
 *
 * This is a structural, source-text check (matches the project's
 * established convention for App Router files, which are server
 * components/exports that vitest's node environment can't render) -
 * not a guarantee the image URL actually resolves; see
 * src/lib/seo/__tests__/metadata.test.ts and the live curl-based
 * verification in the mission report for that half.
 *
 * Most fixed routes now spread ...buildSocialMetadata({...}) instead of
 * writing openGraph/twitter by hand, so this scanner naturally finds
 * nothing to check in them - that's correct, not a gap: a route built
 * that way structurally cannot omit `images` (guaranteed by
 * metadata.test.ts's tests on buildSocialMetadata itself). What this
 * test guards against is a FUTURE page that hand-writes its own
 * openGraph/twitter object instead of using the shared helper, and
 * forgets `images` the same way /ambassadors originally did.
 */

const APP_DIR = path.resolve(__dirname, "../../../app");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "api") continue;
      walk(full, out);
    } else if (entry.name === "page.tsx" || entry.name === "layout.tsx") {
      out.push(full);
    }
  }
  return out;
}

function extractBlock(src: string, key: string): string | null {
  const m = src.match(new RegExp(key + "\\s*:\\s*\\{"));
  if (!m || m.index === undefined) return null;
  const openPos = m.index + m[0].length - 1;
  let depth = 0;
  for (let i = openPos; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(m.index, i + 1);
    }
  }
  return null;
}

describe("every src/app metadata export with its own openGraph/twitter block includes an image", () => {
  const files = walk(APP_DIR);
  // Sanity check on the walker itself, so a refactor that silently
  // breaks discovery (e.g. renaming src/app) fails loudly here instead
  // of this test quietly checking zero files forever.
  it("found a realistic number of page/layout files to check", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  for (const file of files) {
    const rel = path.relative(path.resolve(__dirname, "../../.."), file);
    const src = fs.readFileSync(file, "utf8");
    if (!/export const metadata|export (?:async )?function generateMetadata/.test(src)) continue;

    for (const key of ["openGraph", "twitter"] as const) {
      // A file can legitimately define this block more than once (e.g.
      // a not-found/private-entity early return with no openGraph at
      // all, and a real one further down) - check every occurrence.
      let searchFrom = 0;
      let occurrence = 0;
      for (;;) {
        const idx = src.indexOf(`${key}:`, searchFrom);
        if (idx === -1) break;
        const block = extractBlock(src.slice(idx), key);
        searchFrom = idx + key.length + 1;
        if (!block) continue;
        occurrence++;
        it(`${rel}: ${key} block #${occurrence} has an images field`, () => {
          expect(block).toMatch(/images\s*[:,]/);
        });
      }
    }
  }
});
