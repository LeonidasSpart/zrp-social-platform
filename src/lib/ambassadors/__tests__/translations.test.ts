import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/*
 * Every Ambassadors-related translation key used anywhere in the
 * feature (public pages, admin, components) must exist in all 11 ZRP
 * language blocks - same completeness bar as the country dataset
 * itself. This scans the actual source files for `t("ambassadors...")`
 * / `t("adminAmbassadors...")` calls rather than hand-maintaining a
 * list, so a new key added later is covered automatically and a typo'd
 * key is caught immediately.
 */
const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

const SOURCE_DIRS = [
  "src/app/ambassadors",
  "src/app/admin/ambassadors",
  "src/app/api/ambassadors",
  "src/app/api/admin/ambassadors",
  "src/components/ambassadors",
  "src/components/Header.tsx",
  "src/components/Sidebar.tsx",
  "src/app/admin/layout.tsx",
];

function collectTsxFiles(rel: string): string[] {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) return [];
  if (fs.statSync(full).isFile()) return [rel];
  const out: string[] = [];
  for (const entry of fs.readdirSync(full)) {
    const childRel = path.join(rel, entry);
    const childFull = path.join(root, childRel);
    if (fs.statSync(childFull).isDirectory()) {
      out.push(...collectTsxFiles(childRel));
    } else if (/\.(tsx?|ts)$/.test(entry) && !entry.includes(".test.")) {
      out.push(childRel);
    }
  }
  return out;
}

function extractKeys(src: string): string[] {
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const out: string[] = [];
  const re = /"((?:ambassadors|adminAmbassadors)\.[a-zA-Z0-9.]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped)) !== null) out.push(m[1]);
  return out;
}

const files = SOURCE_DIRS.flatMap(collectTsxFiles);
const allKeys = new Set<string>();
for (const f of files) {
  for (const key of extractKeys(read(f))) allKeys.add(key);
}

describe("Ambassadors translation keys", () => {
  it("found a substantial number of keys in the feature's source files", () => {
    // Sanity check on the scan itself, not just the keys - if this
    // drops to near-zero, the file list/regex above broke, not the
    // translations.
    expect(allKeys.size).toBeGreaterThan(80);
  });

  const dict = read("src/lib/translations.ts");
  it.each(Array.from(allKeys).sort().map((k) => [k] as [string]))(
    "%s is defined in all 11 language blocks",
    (key) => {
      const occurrences = dict.split(`"${key}":`).length - 1;
      expect(occurrences).toBe(11);
    },
  );

  it("every key also appears in the TranslationKey union type", () => {
    // The union is one very long `|`-joined type declaration near the
    // top of the file (no blank-line boundary to split on), so this
    // just scans the region between the union's start and the first
    // language dictionary - past that point "..." occurrences are
    // string values, not the type declaration.
    const unionStart = dict.indexOf("\ntype TranslationKey =");
    const unionEnd = dict.indexOf("export const translations");
    expect(unionStart).toBeGreaterThan(-1);
    expect(unionEnd).toBeGreaterThan(unionStart);
    const unionText = dict.slice(unionStart, unionEnd);
    const notInUnion = Array.from(allKeys).filter((k) => !unionText.includes(`"${k}"`));
    expect(notInUnion).toEqual([]);
  });
});
