import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { prisma } from "@/lib/db";
import { GET } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function req(query: Record<string, string> = {}) {
  const url = new URL("https://zrp.one/api/discover/people");
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

function sessionFor(userId: string) {
  return { user: { id: userId } };
}

/*
 * Covers the "people/businesses near you" browse endpoint (Phase 11/15):
 * a viewer with no known country never gets a guessed result, results
 * are scoped to the viewer's own countryCode, blocked/blocker/muted
 * users are excluded (matching /api/search's own pattern), and the
 * badgeType=organization filter narrows to businesses only.
 */
describe.skipIf(!hasRealDatabaseUrl)("GET /api/discover/people (integration, real Postgres)", () => {
  it("returns 401 when unauthenticated", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("never guesses a country - a viewer with no countryCode gets an explicit empty reason, not a fabricated result", async () => {
    const runId = randomUUID().slice(0, 8);
    const viewer = await prisma.user.create({
      data: {
        email: `people-viewer-nocountry-${runId}@example.com`,
        username: `pv_nocountry_${runId}`,
        password: "x",
        countryCode: null,
      },
    });

    try {
      getServerSession.mockResolvedValueOnce(sessionFor(viewer.id));
      const res = await GET(req());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.users).toEqual([]);
      expect(body.reason).toBe("unknown_viewer_country");
    } finally {
      await prisma.user.delete({ where: { id: viewer.id } }).catch(() => {});
    }
  });

  it("scopes to the viewer's own country, excludes blocked/muted, and supports badgeType=organization", async () => {
    const runId = randomUUID().slice(0, 8);

    const viewer = await prisma.user.create({
      data: { email: `people-viewer-${runId}@example.com`, username: `pv_${runId}`, password: "x", countryCode: "CH" },
    });
    const sameCountryPerson = await prisma.user.create({
      data: { email: `people-a-${runId}@example.com`, username: `pa_${runId}`, password: "x", countryCode: "CH" },
    });
    const sameCountryOrg = await prisma.user.create({
      data: {
        email: `people-org-${runId}@example.com`,
        username: `porg_${runId}`,
        password: "x",
        countryCode: "CH",
        badgeType: "organization",
      },
    });
    const otherCountryPerson = await prisma.user.create({
      data: { email: `people-b-${runId}@example.com`, username: `pb_${runId}`, password: "x", countryCode: "FR" },
    });
    const blockedSameCountry = await prisma.user.create({
      data: { email: `people-blocked-${runId}@example.com`, username: `pblk_${runId}`, password: "x", countryCode: "CH" },
    });
    const mutedSameCountry = await prisma.user.create({
      data: { email: `people-muted-${runId}@example.com`, username: `pmut_${runId}`, password: "x", countryCode: "CH" },
    });

    const userIds = [
      viewer.id,
      sameCountryPerson.id,
      sameCountryOrg.id,
      otherCountryPerson.id,
      blockedSameCountry.id,
      mutedSameCountry.id,
    ];

    try {
      await prisma.blocked.create({ data: { blockerId: viewer.id, blockedId: blockedSameCountry.id } });
      await prisma.mute.create({ data: { muterId: viewer.id, mutedId: mutedSameCountry.id } });

      getServerSession.mockResolvedValue(sessionFor(viewer.id));

      const res = await GET(req());
      expect(res.status).toBe(200);
      const body = await res.json();
      const ids = new Set((body.users as Array<{ id: string }>).map((u) => u.id));

      expect(ids.has(sameCountryPerson.id)).toBe(true);
      expect(ids.has(sameCountryOrg.id)).toBe(true);
      // Country filter: a real user in a different country never appears.
      expect(ids.has(otherCountryPerson.id)).toBe(false);
      // Exclusion list: blocked-by-viewer and muted-by-viewer never appear,
      // even though both are in the viewer's own country.
      expect(ids.has(blockedSameCountry.id)).toBe(false);
      expect(ids.has(mutedSameCountry.id)).toBe(false);
      // A viewer never sees themselves in their own "near you" results.
      expect(ids.has(viewer.id)).toBe(false);

      const orgRes = await GET(req({ badgeType: "organization" }));
      const orgBody = await orgRes.json();
      const orgIds = new Set((orgBody.users as Array<{ id: string }>).map((u) => u.id));
      expect(orgIds.has(sameCountryOrg.id)).toBe(true);
      expect(orgIds.has(sameCountryPerson.id)).toBe(false);
    } finally {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
    }
  });
});
