import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin")>();
  return { ...actual, requireAdmin };
});

import { prisma } from "@/lib/db";
import { GET } from "../route";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function req(qs = "") {
  return new NextRequest(`https://zrp.one/api/admin/launchpad${qs}`);
}

function asAdmin() {
  requireAdmin.mockResolvedValue({ authorized: true, session: { user: { id: "admin-stub" } } });
}

function asUnauthorized() {
  const response = { status: 403 } as unknown as Response;
  requireAdmin.mockResolvedValue({ authorized: false, response });
}

describe.skipIf(!hasRealDatabaseUrl)("GET /api/admin/launchpad (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const tokenIds: string[] = [];
  const vestingIds: string[] = [];
  const stakingPoolIds: string[] = [];
  const referralIds: string[] = [];
  const ambassadorIds: string[] = [];
  const commissionIds: string[] = [];

  beforeAll(async () => {
    const creator = await prisma.user.create({
      data: { email: `lp-admin-creator-${suffix}@example.com`, username: `lpadmcr${suffix}`, password: "x" },
    });
    userIds.push(creator.id);

    const completed = await prisma.launchedToken.create({
      data: {
        name: "Completed Token", symbol: "COMP", imageUrl: "https://uploadthing.com/f/a",
        supply: "1000000000", decimals: 9, feeAmount: 15, feeTransactionId: `tx-comp-${suffix}`,
        status: "COMPLETED", mintAddress: `MintComp${suffix}`, creatorId: creator.id,
      },
    });
    const failed = await prisma.launchedToken.create({
      data: {
        name: "Failed Token", symbol: "FAIL", imageUrl: "https://uploadthing.com/f/b",
        supply: "1000000000", decimals: 9, feeAmount: 15, feeTransactionId: `tx-fail-${suffix}`,
        status: "FAILED", failureReason: "Simulated.", creatorId: null,
      },
    });
    tokenIds.push(completed.id, failed.id);

    const vesting = await prisma.vestingContract.create({
      data: {
        launchedTokenId: completed.id, beneficiaryWalletAddress: `Wallet${suffix}`,
        totalAmount: "1000", cliffSeconds: 0, vestingSeconds: 1000, startAt: new Date(),
        depositTransactionId: `vest-tx-${suffix}`,
      },
    });
    vestingIds.push(vesting.id);

    const pool = await prisma.stakingPool.create({
      data: { launchedTokenId: completed.id, apyBasisPoints: 1000, lockSeconds: 0, minStakeRaw: "1" },
    });
    stakingPoolIds.push(pool.id);

    const ambassadorOwner = await prisma.user.create({
      data: { email: `lp-admin-amb-${suffix}@example.com`, username: `lpadmamb${suffix}`, password: "x" },
    });
    userIds.push(ambassadorOwner.id);
    const ambassador = await prisma.ambassadorProfile.create({
      data: { userId: ambassadorOwner.id, status: "APPROVED", invitationCode: `LPADM-${suffix}`, countryCode: "CH", motivation: "fixture" },
    });
    ambassadorIds.push(ambassador.id);
    const referred = await prisma.user.create({
      data: { email: `lp-admin-referred-${suffix}@example.com`, username: `lpadmref${suffix}`, password: "x" },
    });
    userIds.push(referred.id);
    const referral = await prisma.referral.create({ data: { ambassadorProfileId: ambassador.id, referredUserId: referred.id } });
    referralIds.push(referral.id);
    const commission = await prisma.referralCommission.create({
      data: { referralId: referral.id, sourceType: "LAUNCHPAD_TOKEN_CREATION", sourceId: completed.id, feeAmount: 15, commissionAmount: 2.25 },
    });
    commissionIds.push(commission.id);
  });

  afterAll(async () => {
    await prisma.referralCommission.deleteMany({ where: { id: { in: commissionIds } } });
    await prisma.referral.deleteMany({ where: { id: { in: referralIds } } });
    await prisma.ambassadorProfile.deleteMany({ where: { id: { in: ambassadorIds } } });
    await prisma.stakingPool.deleteMany({ where: { id: { in: stakingPoolIds } } });
    await prisma.vestingContract.deleteMany({ where: { id: { in: vestingIds } } });
    await prisma.launchedToken.deleteMany({ where: { id: { in: tokenIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("rejects a non-admin (401/403 from requireAdmin, no data touched)", async () => {
    asUnauthorized();
    const res = await GET(req());
    expect(res.status).toBe(403);
  });

  it("returns aggregate stats and the token list for an admin", async () => {
    asAdmin();
    const res = await GET(req());
    expect(res.status).toBe(200);
    const data = await res.json();

    const ids = data.tokens.map((t: { id: string }) => t.id);
    expect(ids).toContain(tokenIds[0]);
    expect(ids).toContain(tokenIds[1]);

    const completedRow = data.tokens.find((t: { id: string }) => t.id === tokenIds[0]);
    expect(completedRow.creator.username).toBe(`lpadmcr${suffix}`);
    const failedRow = data.tokens.find((t: { id: string }) => t.id === tokenIds[1]);
    expect(failedRow.creator).toBeNull();
    expect(failedRow.failureReason).toBe("Simulated.");

    expect(data.stats.tokensByStatus.COMPLETED).toBeGreaterThanOrEqual(1);
    expect(data.stats.tokensByStatus.FAILED).toBeGreaterThanOrEqual(1);
    expect(data.stats.vestingContractCount).toBeGreaterThanOrEqual(1);
    expect(data.stats.stakingPoolCount).toBeGreaterThanOrEqual(1);
    // Money-scale fields (feeAmount, totalFeeRevenue,
    // totalReferralCommissionPaid) are plain numbers - only `supply`
    // (a raw SPL base unit) rides the route's string serialization.
    expect(data.stats.totalReferralCommissionPaid).toBeGreaterThanOrEqual(2.25);
    expect(data.stats.totalFeeRevenue).toBeGreaterThanOrEqual(15);
    expect(completedRow.feeAmount).toBe(15);
  });

  it("filters by status", async () => {
    asAdmin();
    const res = await GET(req("?status=FAILED"));
    const data = await res.json();
    const ids = data.tokens.map((t: { id: string }) => t.id);
    expect(ids).toContain(tokenIds[1]);
    expect(ids).not.toContain(tokenIds[0]);
  });
});
