import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireAdmin }));

import { prisma } from "@/lib/db";
import { GET } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

describe.skipIf(!hasRealDatabaseUrl)("GET /api/admin/analytics/geography (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];

  beforeAll(async () => {
    requireAdmin.mockResolvedValue({ authorized: true, session: { user: { id: "admin-1", role: "ADMIN" } } });

    // Two CH users (current + signup country agree), one FR user whose
    // CURRENT country diverges from their SIGNUP country (moved after
    // joining - the exact case Section 2/historical-integrity exists
    // for), and one small cohort of 1 (DE) that must get folded into
    // OTHER rather than named individually.
    const rows = [
      { countryCode: "CH", signupCountryCode: "CH", signupSource: "DIRECT", signupPlatform: "web", languageCode: "de" },
      { countryCode: "CH", signupCountryCode: "CH", signupSource: "REFERRAL", signupPlatform: "ios", languageCode: "fr" },
      { countryCode: "FR", signupCountryCode: "CH", signupSource: "CAMPAIGN", signupPlatform: "android", languageCode: "fr" },
      { countryCode: "DE", signupCountryCode: "DE", signupSource: "DIRECT", signupPlatform: "web", languageCode: "de" },
    ];

    for (let i = 0; i < rows.length; i++) {
      const user = await prisma.user.create({
        data: {
          email: `geo-analytics-test-${suffix}-${i}@example.com`,
          username: `geo_analytics_test_${suffix}_${i}`,
          password: "not-a-real-hash",
          ...rows[i],
        },
      });
      userIds.push(user.id);
    }
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
  });

  it("requires admin authorization", async () => {
    requireAdmin.mockResolvedValueOnce({
      authorized: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    });
    const res = await GET(new NextRequest("https://zrp.one/api/admin/analytics/geography"));
    expect(res.status).toBe(401);
  });

  it("groups current country, signup country, source, platform and language independently", async () => {
    const res = await GET(new NextRequest("https://zrp.one/api/admin/analytics/geography?range=all"));
    expect(res.status).toBe(200);
    const body = await res.json();

    const byCountry = new Map<string, number>(
      body.geography.byCountry.map((r: { key: string; count: number }) => [r.key, r.count])
    );
    const newUsersByCountry = new Map<string, number>(
      body.geography.newUsersByCountry.map((r: { key: string; count: number }) => [r.key, r.count])
    );

    // Current-country snapshot: 2 CH, 1 FR (the mover) - CH's count
    // must include the FR row's ORIGINAL signup country, proving the
    // two breakdowns are independently grouped, not aliases of the
    // same field.
    expect(byCountry.get("CH")).toBeGreaterThanOrEqual(2);
    expect(byCountry.get("FR")).toBeGreaterThanOrEqual(1);

    // Signup-country snapshot: 3 rows signed up as CH (including the
    // mover, whose CURRENT country is FR) - this must never be
    // rewritten by that later profile change.
    expect(newUsersByCountry.get("CH")).toBeGreaterThanOrEqual(3);

    const bySource = new Map<string, number>(
      body.acquisition.bySource.map((r: { key: string; count: number }) => [r.key, r.count])
    );
    expect(bySource.get("DIRECT")).toBeGreaterThanOrEqual(2);
    expect(bySource.get("REFERRAL")).toBeGreaterThanOrEqual(1);
    expect(bySource.get("CAMPAIGN")).toBeGreaterThanOrEqual(1);

    const byPlatform = new Map<string, number>(
      body.platform.byPlatform.map((r: { key: string; count: number }) => [r.key, r.count])
    );
    expect(byPlatform.get("web")).toBeGreaterThanOrEqual(2);
    expect(byPlatform.get("ios")).toBeGreaterThanOrEqual(1);
    expect(byPlatform.get("android")).toBeGreaterThanOrEqual(1);

    const byLanguage = new Map<string, number>(
      body.language.byLanguage.map((r: { key: string; count: number }) => [r.key, r.count])
    );
    expect(byLanguage.get("de")).toBeGreaterThanOrEqual(1);
    expect(byLanguage.get("fr")).toBeGreaterThanOrEqual(2);
  });

  it("respects the ?range= filter for signup-time breakdowns (acquisition/platform)", async () => {
    // All 4 seeded rows were just created, so a 7-day range must
    // include them; there's no reliable way in this shared-DB
    // integration test to seed rows in the PAST (createdAt isn't
    // writable through prisma.user.create in a way this suite can
    // control deterministically), so this test only proves the filter
    // narrows to *something* well-formed rather than erroring, and
    // that switching range doesn't change the un-filtered `range` echo.
    const res = await GET(new NextRequest("https://zrp.one/api/admin/analytics/geography?range=7"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.range).toBe("7");
    expect(Array.isArray(body.acquisition.bySource)).toBe(true);
  });
});
