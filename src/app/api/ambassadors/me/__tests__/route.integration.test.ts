import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

const { getServerSession, requireStaff, logAdminAction } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  requireStaff: vi.fn(),
  logAdminAction: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/admin", () => ({ requireStaff }));
vi.mock("@/lib/audit-log", () => ({ logAdminAction }));

import { prisma } from "@/lib/db";
import { GET as me } from "../route";
import { PATCH as adminPatch } from "../../../admin/ambassadors/[id]/route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function review(userId: string, action: string, reason?: string) {
  return adminPatch(
    new NextRequest(`https://zrp.one/api/admin/ambassadors/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ action, reason }),
    }),
    { params: Promise.resolve({ id: userId }) },
  );
}

/*
 * The lifecycle the /ambassadors landing page, the apply page and the
 * dashboard all key off: what GET /api/ambassadors/me says AFTER an
 * admin review. Ambassador status is deliberately not a JWT claim, so
 * the only correct source is this fresh DB read - if it ever lagged
 * behind the admin action, an approved ambassador would be shown the
 * application form again (the confirmed bug this guards against).
 */
describe.skipIf(!hasRealDatabaseUrl)("GET /api/ambassadors/me after admin review (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  let moderatorId: string;

  async function createUser(label: string, extra: Record<string, unknown> = {}) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${suffix}@ambassadormetest.example`,
        username: `${label}${suffix}`.slice(0, 20),
        password: "x",
        ...extra,
      },
    });
    userIds.push(user.id);
    return user;
  }

  beforeAll(async () => {
    moderatorId = (await createUser("mod", { role: "MODERATOR" })).id;
  });

  beforeEach(() => {
    getServerSession.mockReset();
    requireStaff.mockReset();
    logAdminAction.mockReset();
    requireStaff.mockResolvedValue({
      authorized: true,
      session: { user: { id: moderatorId, username: "moderator" } },
    });
  });

  afterAll(async () => {
    await prisma.ambassadorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("returns 401 when signed out", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await me();
    expect(res.status).toBe(401);
  });

  it("returns { profile: null } for a user who never applied, and never caches", async () => {
    const user = await createUser("never");
    getServerSession.mockResolvedValue({ user: { id: user.id } });
    const res = await me();
    expect(res.status).toBe(200);
    expect((await res.json()).profile).toBeNull();
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("PENDING -> approve -> me reports APPROVED at the AMBASSADOR level", async () => {
    const user = await createUser("approve");
    await prisma.ambassadorProfile.create({
      data: { userId: user.id, countryCode: "DE", motivation: "test" },
    });
    getServerSession.mockResolvedValue({ user: { id: user.id } });

    let body = await (await me()).json();
    expect(body.profile.status).toBe("PENDING");
    expect(body.profile.level).toBe("EXPLORER");

    expect((await review(user.id, "approve")).status).toBe(200);

    body = await (await me()).json();
    expect(body.profile.status).toBe("APPROVED");
    expect(body.profile.level).toBe("AMBASSADOR");
    expect(body.profile.invitationCode).toBeTruthy();
  });

  it("approve -> suspend -> restore is reflected on every read", async () => {
    const user = await createUser("suspend");
    await prisma.ambassadorProfile.create({
      data: { userId: user.id, countryCode: "NG", motivation: "test" },
    });
    getServerSession.mockResolvedValue({ user: { id: user.id } });

    expect((await review(user.id, "approve")).status).toBe(200);
    expect((await review(user.id, "suspend", "Spam")).status).toBe(200);
    let body = await (await me()).json();
    expect(body.profile.status).toBe("SUSPENDED");
    expect(body.profile.suspensionReason).toBe("Spam");

    expect((await review(user.id, "restore")).status).toBe(200);
    body = await (await me()).json();
    expect(body.profile.status).toBe("APPROVED");
    expect(body.profile.level).toBe("AMBASSADOR");
  });

  it("reject -> me reports REJECTED with the reason (re-apply allowed)", async () => {
    const user = await createUser("reject");
    await prisma.ambassadorProfile.create({
      data: { userId: user.id, countryCode: "FR", motivation: "test" },
    });
    getServerSession.mockResolvedValue({ user: { id: user.id } });
    expect((await review(user.id, "reject", "Too thin")).status).toBe(200);
    const body = await (await me()).json();
    expect(body.profile.status).toBe("REJECTED");
    expect(body.profile.rejectionReason).toBe("Too thin");
  });
});
