import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

const { requireAdmin, logAdminAction } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  logAdminAction: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({ requireAdmin }));
vi.mock("@/lib/audit-log", () => ({ logAdminAction }));

import { prisma } from "@/lib/db";
import { POST } from "../reject/route";

/*
 * Regression coverage for a forensic-audit finding: the claim
 * (PENDING -> REJECTED) and the balance refund used to be two separate
 * sequential awaits - a crash between them left the withdrawal
 * permanently REJECTED (the pending-status guard makes it un-retriable)
 * with the reserved amount never credited back: a silent, unrecoverable
 * loss of the creator's own money. Fixed by wrapping both in one
 * prisma.$transaction, the same pattern already used for the approve
 * route's failure path.
 *
 * Uses a real Postgres because the property under test - two concurrent
 * rejections racing the SAME row - depends on genuine database-level
 * atomicity a mocked client can't exercise.
 */
const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function call(id: string) {
  return POST(
    new NextRequest(`https://zrp.one/api/admin/withdrawals/${id}/reject`, { method: "POST" }),
    { params: Promise.resolve({ id }) }
  );
}

describe.skipIf(!hasRealDatabaseUrl)("POST /api/admin/withdrawals/[id]/reject (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const profileIds: string[] = [];
  const withdrawalIds: string[] = [];

  beforeAll(() => {
    requireAdmin.mockResolvedValue({
      authorized: true,
      session: { user: { id: "admin-1", isAdmin: true } },
    });
  });

  afterAll(async () => {
    await prisma.withdrawalRequest.deleteMany({ where: { id: { in: withdrawalIds } } });
    await prisma.creatorProfile.deleteMany({ where: { id: { in: profileIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createPendingWithdrawal(amount: number) {
    const user = await prisma.user.create({
      data: {
        email: `withdrawreject-${randomUUID().slice(0, 8)}@withdrawtest.example`,
        username: `wreject${randomUUID().slice(0, 8)}`,
        password: "x",
      },
    });
    userIds.push(user.id);

    const profile = await prisma.creatorProfile.create({
      data: { userId: user.id, balance: new Prisma.Decimal(0) },
    });
    profileIds.push(profile.id);

    const withdrawal = await prisma.withdrawalRequest.create({
      data: {
        creatorProfileId: profile.id,
        userId: user.id,
        amount: new Prisma.Decimal(amount),
        walletAddress: "SomeWalletAddress",
        status: "PENDING",
      },
    });
    withdrawalIds.push(withdrawal.id);

    return { user, profile, withdrawal };
  }

  it("only one of two concurrent rejections refunds the balance - never zero, never twice", async () => {
    const { profile, withdrawal } = await createPendingWithdrawal(45);

    const [resA, resB] = await Promise.all([call(withdrawal.id), call(withdrawal.id)]);
    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 409]);

    const finalProfile = await prisma.creatorProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(finalProfile.balance.toNumber()).toBe(45); // refunded exactly once

    const finalWithdrawal = await prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: withdrawal.id } });
    expect(finalWithdrawal.status).toBe("REJECTED");
  });

  it("the claim and the refund commit together: a rejected request always shows the refund", async () => {
    const { profile, withdrawal } = await createPendingWithdrawal(12);

    const res = await call(withdrawal.id);
    expect(res.status).toBe(200);

    const finalWithdrawal = await prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: withdrawal.id } });
    const finalProfile = await prisma.creatorProfile.findUniqueOrThrow({ where: { id: profile.id } });

    // These two facts are guaranteed to be consistent with each other -
    // never "REJECTED but balance still 0" - because they now commit as
    // one transaction.
    expect(finalWithdrawal.status).toBe("REJECTED");
    expect(finalProfile.balance.toNumber()).toBe(12);
  });

  it("REGRESSION: a genuine failure between the claim and the refund must roll BOTH back, leaving the withdrawal retriable - not permanently REJECTED with the refund lost", async () => {
    // The two tests above alone do not distinguish the fixed code from
    // the original two-separate-awaits version: neither injects a
    // failure BETWEEN the claim and the refund, which is exactly the
    // crash window the bug lived in. Mocking prisma.creatorProfile.update
    // does not work for this: Prisma's interactive transactions hand the
    // callback a distinct `tx` client whose model methods are NOT the
    // same function references as the top-level `prisma` client's
    // (verified directly - `tx.creatorProfile.update !== prisma.
    // creatorProfile.update`), so a vi.spyOn on the latter is silently
    // never hit inside `prisma.$transaction`.
    //
    // Instead this forces a REAL, unmocked database-level failure inside
    // the transaction's second statement: CreatorProfile.balance is
    // Decimal(18, 6) (12 integer digits max - see schema.prisma), so
    // incrementing a balance already near that ceiling by a large enough
    // withdrawal amount makes Postgres itself raise a genuine "numeric
    // field overflow" while the refund's UPDATE runs.
    //
    // Against the original code (claim, then a separate un-transacted
    // refund), this overflow would throw AFTER the claim already
    // committed on its own - leaving the withdrawal permanently REJECTED
    // (the route's `status !== "PENDING"` guard makes that un-retriable)
    // with the balance never credited back: a silent, permanent loss.
    // Against the fixed code, the very same overflow aborts the whole
    // prisma.$transaction, so the claim rolls back too: the withdrawal
    // is left exactly as it was (PENDING, balance untouched), and a
    // retry - once the amount is corrected to something that fits -
    // succeeds normally.
    const nearCeilingBalance = "900000000000"; // 12 digits - the max this column allows before the decimal point
    const overflowingAmount = "200000000000"; // balance + amount = 13 digits -> overflows Decimal(18,6)
    const { profile, withdrawal } = await createPendingWithdrawal(0);
    await prisma.creatorProfile.update({
      where: { id: profile.id },
      data: { balance: new Prisma.Decimal(nearCeilingBalance) },
    });
    await prisma.withdrawalRequest.update({
      where: { id: withdrawal.id },
      data: { amount: new Prisma.Decimal(overflowingAmount) },
    });

    await expect(call(withdrawal.id)).rejects.toThrow(/numeric field overflow/i);

    const midWithdrawal = await prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: withdrawal.id } });
    const midProfile = await prisma.creatorProfile.findUniqueOrThrow({ where: { id: profile.id } });
    // The fix's guarantee: the claim did NOT survive the refund
    // statement's failure - still PENDING, balance untouched, safely
    // retriable.
    expect(midWithdrawal.status).toBe("PENDING");
    expect(midProfile.balance.toString()).toBe(nearCeilingBalance);

    // A genuine retry, once the amount is corrected to something that
    // actually fits, succeeds and refunds normally - proving PENDING
    // really was retriable, not just a status string that happens to
    // still read PENDING.
    await prisma.withdrawalRequest.update({
      where: { id: withdrawal.id },
      data: { amount: new Prisma.Decimal(30) },
    });
    const retryRes = await call(withdrawal.id);
    expect(retryRes.status).toBe(200);
    const finalProfile = await prisma.creatorProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(finalProfile.balance.toString()).toBe("900000000030");
  });
});
