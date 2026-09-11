import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

const { requireStaff, logAdminAction } = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  logAdminAction: vi.fn(),
}));
vi.mock("@/lib/admin", () => ({ requireStaff }));
vi.mock("@/lib/audit-log", () => ({ logAdminAction }));

import { prisma } from "@/lib/db";
import { PATCH } from "../route";
import { GET as LIST } from "../../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function patch(userId: string, action: string, reason?: string) {
  return PATCH(
    new NextRequest(`https://zrp.one/api/admin/ambassadors/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ action, reason }),
    }),
    { params: Promise.resolve({ id: userId }) },
  );
}

describe.skipIf(!hasRealDatabaseUrl)("PATCH /api/admin/ambassadors/[id] (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  // AmbassadorProfile.reviewedById is a real foreign key to User (see
  // schema.prisma) - a mocked session id with no matching row would
  // make every approve/reject/suspend/restore fail its own FK
  // constraint, so the "moderator" in these tests is a real row too,
  // exactly like a genuine admin action would reference one.
  let moderatorId: string;

  async function createApplicant(label: string, status: "PENDING" | "APPROVED" | "SUSPENDED" | "REJECTED" = "PENDING") {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${suffix}@ambassadoradmintest.example`,
        username: `${label}${suffix}`.slice(0, 20),
        password: "x",
      },
    });
    userIds.push(user.id);
    await prisma.ambassadorProfile.create({
      data: { userId: user.id, countryCode: "NG", motivation: "test", status },
    });
    return user;
  }

  beforeAll(async () => {
    const moderator = await prisma.user.create({
      data: {
        email: `moderator-${suffix}@ambassadoradmintest.example`,
        username: `mod${suffix}`.slice(0, 20),
        password: "x",
        role: "MODERATOR",
      },
    });
    moderatorId = moderator.id;
    userIds.push(moderatorId);
  });

  beforeEach(() => {
    requireStaff.mockReset();
    logAdminAction.mockReset();
    requireStaff.mockResolvedValue({
      authorized: true,
      session: { user: { id: moderatorId, username: "moderator" } },
    });
  });

  afterAll(async () => {
    // Deleting every applicant's own AmbassadorProfile row also removes
    // its reviewedById reference to the moderator, so the moderator
    // user row can then be deleted cleanly too (all in the same
    // userIds list) with nothing left pointing at it.
    await prisma.ambassadorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("returns 401 when the caller is not authenticated", async () => {
    requireStaff.mockResolvedValueOnce({
      authorized: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) as any,
    });
    const user = await createApplicant("unauth");
    const res = await patch(user.id, "approve");
    expect(res.status).toBe(401);
  });

  it("returns 403 for an authenticated non-staff user", async () => {
    requireStaff.mockResolvedValueOnce({
      authorized: false,
      response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) as any,
    });
    const user = await createApplicant("nonstaff");
    const res = await patch(user.id, "approve");
    expect(res.status).toBe(403);
  });

  it("approves a pending application and unlocks the AMBASSADOR level", async () => {
    // Regression: every profile is created at EXPLORER (schema.prisma
    // default) and approval is what's supposed to unlock AMBASSADOR -
    // caught live in manual browser QA when a freshly approved
    // ambassador's dashboard still read "Explorer".
    const user = await createApplicant("approve");
    const res = await patch(user.id, "approve");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.profile.status).toBe("APPROVED");
    expect(body.profile.level).toBe("AMBASSADOR");
  });

  it("rejects a pending application with a reason", async () => {
    const user = await createApplicant("reject");
    const res = await patch(user.id, "reject", "Not enough detail.");
    const body = await res.json();
    expect(body.profile.status).toBe("REJECTED");
    expect(body.profile.rejectionReason).toBe("Not enough detail.");
  });

  it("refuses to approve an already-approved profile", async () => {
    const user = await createApplicant("doubleapprove", "APPROVED");
    const res = await patch(user.id, "approve");
    expect(res.status).toBe(409);
  });

  it("suspends an approved ambassador and restores them", async () => {
    const user = await createApplicant("suspend", "APPROVED");
    const suspendRes = await patch(user.id, "suspend", "Policy violation.");
    const suspendBody = await suspendRes.json();
    expect(suspendBody.profile.status).toBe("SUSPENDED");

    const restoreRes = await patch(user.id, "restore");
    const restoreBody = await restoreRes.json();
    expect(restoreBody.profile.status).toBe("APPROVED");
  });

  it("refuses an invalid action", async () => {
    const user = await createApplicant("badaction");
    const res = await patch(user.id, "delete-everything");
    expect(res.status).toBe(400);
  });

  it("404s for a user with no ambassador application at all", async () => {
    const user = await prisma.user.create({
      data: { email: `noprofile-${suffix}@ambassadoradmintest.example`, username: `noprof${suffix}`.slice(0, 20), password: "x" },
    });
    userIds.push(user.id);
    const res = await patch(user.id, "approve");
    expect(res.status).toBe(404);
  });

  it("logs every successful transition to the admin audit log", async () => {
    const user = await createApplicant("audited");
    await patch(user.id, "approve");
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ambassador.approve", targetType: "User", targetId: user.id }),
    );
  });

  it("does not log a refused/invalid transition", async () => {
    const user = await createApplicant("notaudited", "APPROVED");
    await patch(user.id, "approve"); // already approved -> 409
    expect(logAdminAction).not.toHaveBeenCalled();
  });
});

describe.skipIf(!hasRealDatabaseUrl)("GET /api/admin/ambassadors (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];

  beforeEach(() => {
    requireStaff.mockResolvedValue({
      authorized: true,
      session: { user: { id: "mod-1", username: "moderator" } },
    });
  });

  afterAll(async () => {
    await prisma.ambassadorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("lists applications with correct status counts and a resolved country name", async () => {
    const user = await prisma.user.create({
      data: { email: `list-${suffix}@ambassadoradmintest.example`, username: `list${suffix}`.slice(0, 20), password: "x" },
    });
    userIds.push(user.id);
    await prisma.ambassadorProfile.create({
      data: { userId: user.id, countryCode: "JP", motivation: "test" },
    });

    const res = await LIST(new NextRequest("https://zrp.one/api/admin/ambassadors?status=PENDING"));
    const body = await res.json();

    expect(res.status).toBe(200);
    const row = body.profiles.find((p: { userId: string }) => p.userId === user.id);
    expect(row).toBeTruthy();
    expect(row.countryName).toBe("Japan");
    expect(body.counts.PENDING).toBeGreaterThanOrEqual(1);
  });
});
