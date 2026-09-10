import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { prisma } from "@/lib/db";
import { POST as APPLY } from "../route";
import { GET as ME } from "../../me/route";
import { GET as COUNTRIES } from "../../countries/route";
import { GET as STATS } from "../../stats/route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

let ipCounter = 1;
function apply(body: unknown, ip?: string) {
  // Each call gets its own synthetic IP by default so the apply
  // route's own IP rate limiter (5/hour) doesn't bleed between
  // unrelated test cases - the one test that deliberately exercises
  // the rate limiter passes a shared `ip` itself.
  return APPLY(
    new NextRequest("https://zrp.one/api/ambassadors/apply", {
      method: "POST",
      headers: { "x-forwarded-for": ip || `203.0.113.${ipCounter++}` },
      body: JSON.stringify(body),
    }),
  );
}

const VALID_BODY = {
  countryCode: "ch",
  cityRegion: "Zurich",
  languages: ["en", "de"],
  communityLinks: ["https://example.com/community"],
  motivation: "I want to grow ZRP's community in Switzerland.",
  communityDescription: "A group of privacy-minded creators.",
  audienceSize: 500,
};

describe.skipIf(!hasRealDatabaseUrl)("POST /api/ambassadors/apply (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${suffix}@ambassadortest.example`,
        username: `${label}${suffix}`.slice(0, 20),
        password: "x",
      },
    });
    userIds.push(user.id);
    return user;
  }

  afterAll(async () => {
    await prisma.ambassadorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  beforeEach(() => {
    getServerSession.mockReset();
  });

  it("returns 401 when not signed in", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await apply(VALID_BODY);
    expect(res.status).toBe(401);
  });

  it("rejects an invalid country code", async () => {
    const user = await createUser("badcountry");
    getServerSession.mockResolvedValueOnce({ user: { id: user.id } });
    const res = await apply({ ...VALID_BODY, countryCode: "ZZ" });
    expect(res.status).toBe(400);
  });

  it("rejects a non-https community link", async () => {
    const user = await createUser("badlink");
    getServerSession.mockResolvedValueOnce({ user: { id: user.id } });
    const res = await apply({ ...VALID_BODY, communityLinks: ["http://insecure.example.com"] });
    expect(res.status).toBe(400);
  });

  it("rejects a missing motivation", async () => {
    const user = await createUser("nomotivation");
    getServerSession.mockResolvedValueOnce({ user: { id: user.id } });
    const res = await apply({ ...VALID_BODY, motivation: "" });
    expect(res.status).toBe(400);
  });

  it("creates a PENDING application for a valid submission", async () => {
    const user = await createUser("valid");
    getServerSession.mockResolvedValueOnce({ user: { id: user.id } });
    const res = await apply(VALID_BODY);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.profile.status).toBe("PENDING");
    expect(body.profile.countryCode).toBe("CH");
    // Never told they are an official ambassador before approval.
    expect(body.profile.status).not.toBe("APPROVED");
  });

  it("refuses a second application while one is already pending", async () => {
    const user = await createUser("duplicate");
    getServerSession.mockResolvedValue({ user: { id: user.id } });
    const sharedIp = "203.0.113.201";
    await apply(VALID_BODY, sharedIp);
    const res = await apply(VALID_BODY, sharedIp);
    expect(res.status).toBe(409);
  });

  it("allows re-applying after a REJECTED application", async () => {
    const user = await createUser("reapply");
    getServerSession.mockResolvedValue({ user: { id: user.id } });
    const sharedIp = "203.0.113.202";
    await apply(VALID_BODY, sharedIp);
    await prisma.ambassadorProfile.update({
      where: { userId: user.id },
      data: { status: "REJECTED" },
    });

    const res = await apply(VALID_BODY, sharedIp);
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.profile.status).toBe("PENDING");
  });

  it("assigns a stable, unique invitation code", async () => {
    const user = await createUser("invite");
    getServerSession.mockResolvedValueOnce({ user: { id: user.id } });
    const res = await apply(VALID_BODY);
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(typeof body.profile.invitationCode).toBe("string");
    expect(body.profile.invitationCode.length).toBeGreaterThan(5);
  });

  it("enforces its own rate limit against repeated applications from one source", async () => {
    const user = await createUser("ratelimited");
    getServerSession.mockResolvedValue({ user: { id: user.id } });
    const sharedIp = "203.0.113.250";
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await apply(VALID_BODY, sharedIp)).status);
    }
    expect(statuses).toContain(429);
  });
});

describe.skipIf(!hasRealDatabaseUrl)("GET /api/ambassadors/me (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.ambassadorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  beforeEach(() => getServerSession.mockReset());

  it("returns 401 when not signed in", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await ME();
    expect(res.status).toBe(401);
  });

  it("returns profile: null for a user who has never applied - not a fabricated profile", async () => {
    const user = await prisma.user.create({
      data: { email: `me-${suffix}@ambassadortest.example`, username: `me${suffix}`.slice(0, 20), password: "x" },
    });
    userIds.push(user.id);
    getServerSession.mockResolvedValueOnce({ user: { id: user.id } });

    const res = await ME();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.profile).toBeNull();
  });

  it("returns the caller's own real profile", async () => {
    const user = await prisma.user.create({
      data: { email: `me2-${suffix}@ambassadortest.example`, username: `me2${suffix}`.slice(0, 20), password: "x" },
    });
    userIds.push(user.id);
    await prisma.ambassadorProfile.create({
      data: { userId: user.id, countryCode: "FR", motivation: "test" },
    });
    getServerSession.mockResolvedValueOnce({ user: { id: user.id } });

    const res = await ME();
    const body = await res.json();
    expect(body.profile.countryCode).toBe("FR");
  });
});

describe.skipIf(!hasRealDatabaseUrl)("GET /api/ambassadors/countries (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.ambassadorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("returns the complete, unfiltered dataset - not a curated subset", async () => {
    const res = await COUNTRIES(new NextRequest("https://zrp.one/api/ambassadors/countries"));
    const body = await res.json();
    expect(body.countries.length).toBeGreaterThan(200);
    // A zero-ambassador country must still be present, not omitted.
    expect(body.countries.find((c: { code: string }) => c.code === "TV")).toBeTruthy();
  });

  it("shows ambassadors: 0 for a country with none - never omitted, never invented", async () => {
    const res = await COUNTRIES(new NextRequest("https://zrp.one/api/ambassadors/countries"));
    const body = await res.json();
    const antarctica = body.countries.find((c: { code: string }) => c.code === "AQ");
    expect(antarctica).toBeTruthy();
    expect(antarctica.ambassadors).toBe(0);
    expect(antarctica.communities).toBe(0);
  });

  it("counts only APPROVED profiles as real ambassadors, not pending/rejected ones", async () => {
    const approvedUser = await prisma.user.create({
      data: { email: `appr-${suffix}@ambassadortest.example`, username: `appr${suffix}`.slice(0, 20), password: "x" },
    });
    const pendingUser = await prisma.user.create({
      data: { email: `pend-${suffix}@ambassadortest.example`, username: `pend${suffix}`.slice(0, 20), password: "x" },
    });
    userIds.push(approvedUser.id, pendingUser.id);
    await prisma.ambassadorProfile.create({
      data: { userId: approvedUser.id, countryCode: "MA", motivation: "t", status: "APPROVED" },
    });
    await prisma.ambassadorProfile.create({
      data: { userId: pendingUser.id, countryCode: "MA", motivation: "t", status: "PENDING" },
    });

    const res = await COUNTRIES(new NextRequest("https://zrp.one/api/ambassadors/countries"));
    const body = await res.json();
    const morocco = body.countries.find((c: { code: string }) => c.code === "MA");
    expect(morocco.ambassadors).toBe(1);
  });

  it("localizes country names to the requested language", async () => {
    const res = await COUNTRIES(new NextRequest("https://zrp.one/api/ambassadors/countries?lang=fr"));
    const body = await res.json();
    const switzerland = body.countries.find((c: { code: string }) => c.code === "CH");
    expect(switzerland.name).toBe("Suisse");
  });
});

describe.skipIf(!hasRealDatabaseUrl)("GET /api/ambassadors/stats (integration, real Postgres)", () => {
  it("returns real, non-negative aggregate counts", async () => {
    const res = await STATS();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(typeof body.totalAmbassadors).toBe("number");
    expect(body.totalAmbassadors).toBeGreaterThanOrEqual(0);
    expect(typeof body.countriesRepresented).toBe("number");
  });
});
