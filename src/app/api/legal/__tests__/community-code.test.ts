import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { SUPPORTED_LANGUAGES } from "@/lib/translations";
import { COMMUNITY_CODE_CONFIG, LEGAL_CONFIGS, LEGAL_PAGE_IDS, resolvePage } from "@/lib/legal-content";
import { GET } from "../[page]/route";

/*
 * The ZRP Community & Leadership Code is served through the exact same
 * single-source-of-truth pipeline as every other legal page
 * (legal-content.ts -> GET /api/legal/[page]), which is what Android and
 * iOS both read from. This asserts: the page id is registered, every
 * section resolves with real (non-empty, non-raw-key) text in all 11
 * languages, and the live route actually returns it.
 */
describe("ZRP Community & Leadership Code - single source of truth", () => {
  it("registers communityCode as a legal page id", () => {
    expect(LEGAL_PAGE_IDS).toContain("communityCode");
    expect(LEGAL_CONFIGS.communityCode).toBe(COMMUNITY_CODE_CONFIG);
  });

  it("declares sections A through I", () => {
    const ids = COMMUNITY_CODE_CONFIG.sections.map((s) => s.id);
    expect(ids).toEqual([
      "a-community-guidelines",
      "b-ambassador-code",
      "c-country-manager-code",
      "d-leadership-standards",
      "e-reporting-safety",
      "f-moderation-enforcement",
      "g-appeals",
      "h-status-distinction",
      "i-version-acceptance",
    ]);
  });

  it.each(SUPPORTED_LANGUAGES.map((l) => [l.code] as [string]))(
    "resolves non-empty, translated text for every section in %s",
    (lang) => {
      const resolved = resolvePage(COMMUNITY_CODE_CONFIG, lang as any);
      expect(resolved.title.length).toBeGreaterThan(0);
      expect(resolved.subtitle?.length).toBeGreaterThan(0);
      for (const section of resolved.sections) {
        expect(section.title.length).toBeGreaterThan(0);
        // A resolved block whose text still starts with "communityCode."
        // means the key was never translated and the raw key leaked
        // through the fallback chain instead.
        for (const block of section.body) {
          const text = "text" in block ? block.text : undefined;
          if (text) expect(text.startsWith("communityCode.")).toBe(false);
        }
      }
    },
  );

  it("GET /api/legal/communityCode returns the resolved page", async () => {
    const req = new NextRequest("https://zrp.one/api/legal/communityCode");
    const res = await GET(req, { params: Promise.resolve({ page: "communityCode" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.page).toBe("communityCode");
    expect(body.sections.length).toBe(9);
  });

  it("GET /api/legal/communityCode honors ?lang= the same way other legal pages do", async () => {
    const req = new NextRequest("https://zrp.one/api/legal/communityCode?lang=fr");
    const res = await GET(req, { params: Promise.resolve({ page: "communityCode" }) });
    const body = await res.json();
    expect(body.lang).toBe("fr");
    expect(body.title).toContain("Code de communauté");
  });
});
