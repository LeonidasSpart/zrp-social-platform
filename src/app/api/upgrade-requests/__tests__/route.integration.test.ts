import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

const { getServerSession, requireAdmin } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/admin", () => ({ requireAdmin }));

import { prisma } from "@/lib/db";
import { POST, GET } from "../route";

/*
 * Coverage for the create/list side of the manual upgrade-request flow
 * (POST/GET /api/upgrade-requests) - previously only the approve/deny
 * route ([id]/__tests__/route.integration.test.ts) had a test. This is
 * the route three UI surfaces now call into: web's UpgradeRequestModal,
 * the admin review page, and (added this session) Android's
 * UpgradeRequestDialog via UpgradeRequestApi.kt.
 *
 * Uses a real Postgres, matching the sibling [id] test, because the
 * duplicate-request guard below is a real query against the table, not
 * something a mocked Prisma client would meaningfully exercise.
 */
const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function postReq(body: unknown) {
  return new NextRequest("https://zrp.one/api/upgrade-requests", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function getReq(status?: string) {
  const url = status
    ? `https://zrp.one/api/upgrade-requests?status=${status}`
    : "https://zrp.one/api/upgrade-requests";
  return new NextRequest(url);
}

function sessionFor(userId: string) {
  return { user: { id: userId } };
}

describe.skipIf(!hasRealDatabaseUrl)("POST/GET /api/upgrade-requests (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const requestIds: string[] = [];

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${suffix}@upgradereqroutetest.example`,
        username: `${label}${suffix}`.slice(0, 20),
        password: "x",
        plan: "free",
      },
    });
    userIds.push(user.id);
    return user;
  }

  afterAll(async () => {
    await prisma.upgradeRequest.deleteMany({ where: { id: { in: requestIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("rejects an unauthenticated request", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await POST(postReq({ requestedPlan: "pro" }));
    expect(res.status).toBe(401);
  });

  it("rejects a plan that isn't pro/business/enterprise", async () => {
    const user = await createUser("badplan");
    getServerSession.mockResolvedValueOnce(sessionFor(user.id));

    const res = await POST(postReq({ requestedPlan: "free" }));
    expect(res.status).toBe(400);

    const rows = await prisma.upgradeRequest.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(0);
  });

  it("creates a pending request with the submitted payment method and note", async () => {
    const user = await createUser("create");
    getServerSession.mockResolvedValueOnce(sessionFor(user.id));

    const res = await POST(postReq({ requestedPlan: "pro", paymentMethod: "bank", message: "please" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    requestIds.push(body.request.id);

    const row = await prisma.upgradeRequest.findUnique({ where: { id: body.request.id } });
    expect(row?.userId).toBe(user.id);
    expect(row?.requestedPlan).toBe("pro");
    expect(row?.paymentMethod).toBe("bank");
    expect(row?.message).toBe("please");
    expect(row?.status).toBe("pending");
  });

  it("refuses a second pending request for the SAME plan", async () => {
    const user = await createUser("dupe-same");
    getServerSession.mockResolvedValue(sessionFor(user.id));

    const first = await POST(postReq({ requestedPlan: "business" }));
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    requestIds.push(firstBody.request.id);

    const second = await POST(postReq({ requestedPlan: "business" }));
    expect(second.status).toBe(400);

    const rows = await prisma.upgradeRequest.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
  });

  // Documents real, current behavior (not a desired contract): the
  // duplicate guard in route.ts is scoped to (userId, requestedPlan,
  // status), not (userId, status) - so a user CAN have two simultaneous
  // pending requests for two different plans. Flagged in this session's
  // audit as a plan-integrity gap (an admin approving both, days apart,
  // can silently leave the user on the wrong plan) but fixing it is a
  // backend/business-logic change outside this pass's scope. This test
  // exists so that decision is made on purpose, not by accident - it
  // will fail the moment someone tightens the guard, which is the
  // intended trigger to update this test alongside that fix.
  it("currently allows simultaneous pending requests for DIFFERENT plans (known gap, not yet fixed)", async () => {
    const user = await createUser("dupe-diff");
    getServerSession.mockResolvedValue(sessionFor(user.id));

    const first = await POST(postReq({ requestedPlan: "pro" }));
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    requestIds.push(firstBody.request.id);

    const second = await POST(postReq({ requestedPlan: "business" }));
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    requestIds.push(secondBody.request.id);

    const rows = await prisma.upgradeRequest.findMany({
      where: { userId: user.id, status: "pending" },
    });
    expect(rows).toHaveLength(2);
  });

  it("GET requires admin authorization", async () => {
    requireAdmin.mockResolvedValueOnce({
      authorized: false,
      response: new Response(null, { status: 403 }),
    });
    const res = await GET(getReq());
    expect(res.status).toBe(403);
  });

  it("GET lists only requests matching the status filter, newest first", async () => {
    requireAdmin.mockResolvedValue({
      authorized: true,
      session: { user: { id: "admin-1", isAdmin: true } },
    });
    const user = await createUser("list");
    getServerSession.mockResolvedValue(sessionFor(user.id));

    const created = await POST(postReq({ requestedPlan: "enterprise" }));
    const createdBody = await created.json();
    requestIds.push(createdBody.request.id);

    const res = await GET(getReq("pending"));
    expect(res.status).toBe(200);
    const list = await res.json();
    const match = list.find((r: { id: string }) => r.id === createdBody.request.id);
    expect(match).toBeTruthy();
    expect(match.user.username).toBe(user.username);
    expect(match.status).toBe("pending");

    const approvedOnly = await GET(getReq("approved"));
    const approvedList = await approvedOnly.json();
    expect(approvedList.find((r: { id: string }) => r.id === createdBody.request.id)).toBeUndefined();
  });
});
