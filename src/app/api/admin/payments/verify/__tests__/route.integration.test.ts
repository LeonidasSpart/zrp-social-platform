import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

const { requireAdmin, logAdminAction, invalidateUserAuthState } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  logAdminAction: vi.fn(),
  invalidateUserAuthState: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({ requireAdmin }));
vi.mock("@/lib/audit-log", () => ({ logAdminAction }));
vi.mock("@/lib/auth-state", () => ({ invalidateUserAuthState }));

import { prisma } from "@/lib/db";
import { POST } from "../route";

/*
 * Same race condition and fix as
 * src/app/api/upgrade-requests/[id]/__tests__/route.integration.test.ts:
 * this route also read PaymentRequest.status, checked "pending", and
 * only then wrote "verified" - two concurrent verifications of the same
 * paymentId both passed the check and both upgraded the plan / logged
 * the action. Now claimed first via a conditional updateMany.
 */
const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function call(paymentId: string) {
  return POST(
    new NextRequest("https://zrp.one/api/admin/payments/verify", {
      method: "POST",
      body: JSON.stringify({ paymentId }),
    })
  );
}

describe.skipIf(!hasRealDatabaseUrl)("POST /api/admin/payments/verify (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const paymentIds: string[] = [];

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${suffix}@paymentverifytest.example`,
        username: `${label}${suffix}`.slice(0, 20),
        password: "x",
        plan: "free",
      },
    });
    userIds.push(user.id);
    return user;
  }

  async function createPaymentRequest(userId: string, plan: string) {
    const payment = await prisma.paymentRequest.create({
      data: { userId, plan, amount: "10.00", status: "pending" },
    });
    paymentIds.push(payment.id);
    return payment;
  }

  beforeAll(() => {
    requireAdmin.mockResolvedValue({
      authorized: true,
      session: { user: { id: "admin-1", isAdmin: true } },
    });
  });

  afterAll(async () => {
    await prisma.paymentRequest.deleteMany({ where: { id: { in: paymentIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("only one of two concurrent verifications of the same payment succeeds", async () => {
    const user = await createUser("racer");
    const payment = await createPaymentRequest(user.id, "pro");

    const [resA, resB] = await Promise.all([call(payment.id), call(payment.id)]);
    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 409]);

    const finalUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(finalUser?.plan).toBe("pro");

    const finalPayment = await prisma.paymentRequest.findUnique({ where: { id: payment.id } });
    expect(finalPayment?.status).toBe("verified");

    // Exactly one audit-log write, not two, for one verification.
    expect(logAdminAction).toHaveBeenCalledTimes(1);
  });

  it("rejects verifying a payment that was already verified", async () => {
    const user = await createUser("already");
    const payment = await createPaymentRequest(user.id, "business");

    const first = await call(payment.id);
    expect(first.status).toBe(200);

    logAdminAction.mockClear();
    const second = await call(payment.id);
    expect(second.status).toBe(400);
    expect(logAdminAction).not.toHaveBeenCalled();
  });
});
