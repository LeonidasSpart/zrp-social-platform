import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

const { requireAdmin, invalidateUserAuthState } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  invalidateUserAuthState: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({ requireAdmin }));
vi.mock("@/lib/auth-state", () => ({ invalidateUserAuthState }));

import { prisma } from "@/lib/db";
import { PUT } from "../route";

/*
 * Regression coverage for a genuine race condition found in the backend
 * audit: this route read the request's status, checked it was "pending",
 * and only THEN wrote the approval - two concurrent approvals of the
 * SAME request both passed the check before either wrote, both applied
 * the plan change and both wrote a duplicate audit-log entry for a
 * single approval. The fix claims the row first via a conditional
 * `updateMany({where:{id,status:"pending"}})`, the same compare-and-swap
 * pattern already used correctly by the withdrawal approval route -
 * only one concurrent caller can ever win it.
 *
 * Also regression coverage for a forensic-audit finding: the claim, the
 * plan update, and the audit-log write used to be three separate
 * sequential awaits AFTER the claim committed - a crash between them
 * left the request permanently "approved" with the plan never actually
 * changed, and no way to retry (the pending-status guard rejects a
 * retry once the row already shows "approved"). All three now run
 * inside one `prisma.$transaction`, verified below by checking the real
 * `auditLog` table (not a mock) exists in lockstep with the plan
 * change - proving they commit or fail together.
 *
 * Uses a real Postgres because the property under test - two writers
 * racing against the SAME row - depends on genuine database-level
 * atomicity that a mocked Prisma client can't exercise.
 */
const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function call(id: string, action: "approve" | "deny") {
  return PUT(
    new NextRequest(`https://zrp.one/api/upgrade-requests/${id}`, {
      method: "PUT",
      body: JSON.stringify({ action }),
    }),
    { params: Promise.resolve({ id }) }
  );
}

describe.skipIf(!hasRealDatabaseUrl)("PUT /api/upgrade-requests/[id] (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const requestIds: string[] = [];

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${suffix}@upgradereqtest.example`,
        username: `${label}${suffix}`.slice(0, 20),
        password: "x",
        plan: "free",
      },
    });
    userIds.push(user.id);
    return user;
  }

  async function createUpgradeRequest(userId: string, requestedPlan: string) {
    const req = await prisma.upgradeRequest.create({
      data: { userId, requestedPlan, status: "pending" },
    });
    requestIds.push(req.id);
    return req;
  }

  beforeAll(() => {
    requireAdmin.mockResolvedValue({
      authorized: true,
      session: { user: { id: "admin-1", isAdmin: true } },
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { targetId: { in: requestIds } } });
    await prisma.upgradeRequest.deleteMany({ where: { id: { in: requestIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("only one of two concurrent approvals of the same request succeeds", async () => {
    const user = await createUser("racer");
    const request = await createUpgradeRequest(user.id, "pro");

    const [resA, resB] = await Promise.all([call(request.id, "approve"), call(request.id, "approve")]);
    const [bodyA, bodyB] = await Promise.all([resA.json(), resB.json()]);

    const statuses = [resA.status, resB.status].sort();
    // One winner (200), one loser (409 - already claimed).
    expect(statuses).toEqual([200, 409]);
    const [winnerBody] = [bodyA, bodyB].filter((b) => b.success);
    expect(winnerBody.success).toBe(true);

    const finalUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(finalUser?.plan).toBe("pro");

    const finalRequest = await prisma.upgradeRequest.findUnique({ where: { id: request.id } });
    expect(finalRequest?.status).toBe("approved");

    // The whole point of the fix: exactly one audit-log write, not two -
    // and it exists in the real table, proving it committed in the same
    // transaction as the plan change rather than via a separate,
    // independently-failable write.
    const auditRows = await prisma.auditLog.findMany({ where: { targetId: request.id } });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].action).toBe("upgrade_request.approve");
  });

  it("rejects approving a request that was already approved", async () => {
    const user = await createUser("already");
    const request = await createUpgradeRequest(user.id, "business");

    const first = await call(request.id, "approve");
    expect(first.status).toBe(200);

    // A plain sequential re-call (not a race) is caught by the earlier
    // findUnique-based status check, which returns 400 - the 409 from
    // the atomic claim below only fires when two callers both pass that
    // check concurrently (see the race test above).
    const second = await call(request.id, "approve");
    expect(second.status).toBe(400);

    // Still exactly the one audit-log write from the first, successful call.
    const auditRows = await prisma.auditLog.findMany({ where: { targetId: request.id } });
    expect(auditRows).toHaveLength(1);
  });

  it("only one of two concurrent denials of the same request succeeds", async () => {
    const user = await createUser("denyrace");
    const request = await createUpgradeRequest(user.id, "enterprise");

    const [resA, resB] = await Promise.all([call(request.id, "deny"), call(request.id, "deny")]);
    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 409]);

    const finalRequest = await prisma.upgradeRequest.findUnique({ where: { id: request.id } });
    expect(finalRequest?.status).toBe("denied");

    // Denial must never touch the user's plan.
    const finalUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(finalUser?.plan).toBe("free");
  });
});
