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
import { POST } from "../route";

/*
 * Same race condition and fix as
 * src/app/api/upgrade-requests/[id]/__tests__/route.integration.test.ts:
 * this route also read PaymentRequest.status, checked "pending", and
 * only then wrote "verified" - two concurrent verifications of the same
 * paymentId both passed the check and both upgraded the plan / logged
 * the action. Now claimed first via a conditional updateMany.
 *
 * Also regression coverage for a forensic-audit finding: the claim, the
 * plan update, and the audit-log write now run inside one
 * `prisma.$transaction` rather than as separate sequential awaits after
 * the claim committed - closing a window where a crash between them
 * left the payment permanently "verified" with the plan never actually
 * granted. Verified below against the real `auditLog` table, not a mock.
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
    await prisma.auditLog.deleteMany({ where: { targetId: { in: paymentIds } } });
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

    // Exactly one audit-log write, not two, for one verification - and it
    // exists in the real table, proving it committed in the same
    // transaction as the plan change.
    const auditRows = await prisma.auditLog.findMany({ where: { targetId: payment.id } });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].action).toBe("payment.verify");
  });

  it("rejects verifying a payment that was already verified", async () => {
    const user = await createUser("already");
    const payment = await createPaymentRequest(user.id, "business");

    const first = await call(payment.id);
    expect(first.status).toBe(200);

    const second = await call(payment.id);
    expect(second.status).toBe(400);

    // Still exactly the one audit-log write from the first, successful call.
    const auditRows = await prisma.auditLog.findMany({ where: { targetId: payment.id } });
    expect(auditRows).toHaveLength(1);
  });
});
