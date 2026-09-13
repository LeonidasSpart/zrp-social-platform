import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { SUPPORTED_LANGUAGES } from "@/lib/translations";

/*
 * Every ZRP Community & Leadership Code translation key used anywhere in
 * the feature (the /community-code hub page, the Ambassador apply/
 * dashboard acceptance flow, and its nav links) must exist in every ZRP
 * language block - same completeness bar as the Ambassadors feature
 * itself (see src/lib/ambassadors/__tests__/translations.test.ts, which
 * this mirrors). Scans source files for t("communityCode...")/
 * t("ambassadors.apply.codeOfConduct...")/t("ambassadors.dashboard.code...")
 * calls rather than hand-maintaining a list. The expected occurrence
 * count is derived from SUPPORTED_LANGUAGES rather than hardcoded.
 */
const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

const SOURCE_DIRS = [
  "src/app/community-code",
  "src/app/ambassadors",
  "src/components/Header.tsx",
  "src/components/Sidebar.tsx",
  "src/components/Footer.tsx",
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
  const re = /"(communityCode\.[a-zA-Z0-9.]+|ambassadors\.apply\.codeOfConduct[a-zA-Z0-9.]*|ambassadors\.apply\.errCodeRequired|ambassadors\.dashboard\.code[a-zA-Z0-9.]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped)) !== null) out.push(m[1]);
  return out;
}

const files = SOURCE_DIRS.flatMap(collectTsxFiles);
const allKeys = new Set<string>();
for (const f of files) {
  for (const key of extractKeys(read(f))) allKeys.add(key);
}

describe("Community & Leadership Code translation keys", () => {
  it("found a substantial number of keys in the feature's source files", () => {
    expect(allKeys.size).toBeGreaterThan(100);
  });

  const dict = read("src/lib/translations.ts");
  const languageCount = SUPPORTED_LANGUAGES.length;
  it.each(Array.from(allKeys).sort().map((k) => [k] as [string]))(
    `%s is defined in all ${languageCount} language blocks`,
    (key) => {
      const occurrences = dict.split(`"${key}":`).length - 1;
      expect(occurrences).toBe(languageCount);
    },
  );

  it("every key also appears in the TranslationKey union type", () => {
    const unionStart = dict.indexOf("\ntype TranslationKey =");
    const unionEnd = dict.indexOf("export const translations");
    expect(unionStart).toBeGreaterThan(-1);
    expect(unionEnd).toBeGreaterThan(unionStart);
    const unionText = dict.slice(unionStart, unionEnd);
    const notInUnion = Array.from(allKeys).filter((k) => !unionText.includes(`"${k}"`));
    expect(notInUnion).toEqual([]);
  });

  it("no translated value still carries the old {version}/{date} placeholder tokens", () => {
    // legal-content.ts's resolver does not substitute {placeholder}
    // tokens - communityCode.i.versionBody was rewritten specifically to
    // avoid needing them (see legal-content.ts's COMMUNITY_CODE_CONFIG
    // comment). A stray {version}/{date} literal would render verbatim.
    const versionBodyOccurrences = dict.match(/"communityCode\.i\.versionBody":\s*"((?:[^"\\]|\\.)*)"/g) ?? [];
    expect(versionBodyOccurrences.length).toBe(languageCount);
    for (const occurrence of versionBodyOccurrences) {
      expect(occurrence).not.toMatch(/\{version\}|\{date\}/);
    }
  });
});
