import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

/*
 * Regression coverage: the SAME two bugs fixed on the creator withdrawal
 * approve route (src/app/api/admin/withdrawals/[id]/approve/route.ts)
 * existed here too, since this route calls the identical sendUsdc().
 *
 * BUG 1: sendUsdc() throwing ANY error used to refund the campaign's
 * balance immediately, even when the SDK's own thrown error carries a
 * broadcast signature - meaning a transaction WAS sent and its outcome
 * is genuinely unknown, not a known failure. Fixed: an ambiguous
 * broadcast is recorded and left PROCESSING for manual review, never
 * auto-refunded.
 *
 * BUG 2 (worse here than on the creator route): the finalize
 * $transaction and the sendUsdc() call shared ONE catch block, so a
 * finalize failure AFTER sendUsdc() had already succeeded used to be
 * treated exactly like a failed send - refunding money that had
 * ALREADY left the platform wallet, a double loss. Fixed: the
 * transaction hash is persisted as its own write before the finalize
 * transaction runs, and a finalize failure is reported as "needs manual
 * review", never funneled into the refund path.
 */
const solanaMocks = vi.hoisted(() => ({ sendUsdc: vi.fn() }));
vi.mock("@/lib/solana", () => solanaMocks);

const { requireAdmin, logAdminAction } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  logAdminAction: vi.fn(),
}));
vi.mock("@/lib/admin", () => ({ requireAdmin }));
vi.mock("@/lib/audit-log", () => ({ logAdminAction }));

import { prisma } from "@/lib/db";
import { POST } from "../approve/route";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

class AmbiguousBroadcastError extends Error {
  signature: string;
  constructor(signature: string) {
    super("Transaction was not confirmed in time. It is unknown if it succeeded or failed.");
    this.signature = signature;
  }
}

function call(id: string) {
  return POST(
    new NextRequest(`https://zrp.one/api/admin/help-withdrawals/${id}/approve`, { method: "POST" }),
    { params: Promise.resolve({ id }) }
  );
}

describe.skipIf(!hasRealDatabaseUrl)("POST /api/admin/help-withdrawals/[id]/approve (integration, real Postgres)", () => {
  const userIds: string[] = [];
  const campaignIds: string[] = [];

  beforeAll(() => {
    requireAdmin.mockResolvedValue({
      authorized: true,
      session: { user: { id: "admin-1", isAdmin: true } },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({
      authorized: true,
      session: { user: { id: "admin-1", isAdmin: true } },
    });
  });

  afterAll(async () => {
    await prisma.helpWithdrawalRequest.deleteMany({ where: { campaignId: { in: campaignIds } } });
    await prisma.helpCampaign.deleteMany({ where: { id: { in: campaignIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createPendingWithdrawal(amount: number) {
    const user = await prisma.user.create({
      data: {
        email: `helpwithdraw-${randomUUID().slice(0, 8)}@withdrawtest.example`,
        username: `hwappr${randomUUID().slice(0, 8)}`,
        password: "x",
      },
    });
    userIds.push(user.id);

    const campaign = await prisma.helpCampaign.create({
      data: {
        organizerId: user.id,
        category: "EMERGENCY",
        title: "Test campaign",
        description: "Test",
        balance: new Prisma.Decimal(0),
        totalWithdrawn: new Prisma.Decimal(0),
      },
    });
    campaignIds.push(campaign.id);

    const withdrawal = await prisma.helpWithdrawalRequest.create({
      data: {
        campaignId: campaign.id,
        organizerId: user.id,
        amount: new Prisma.Decimal(amount),
        walletAddress: "SomeWalletAddress",
        status: "PENDING",
      },
    });

    return { user, campaign, withdrawal };
  }

  it("REGRESSION: an ambiguous broadcast (signature exists) is NOT auto-refunded - it's recorded and left for manual review", async () => {
    const { campaign, withdrawal } = await createPendingWithdrawal(30);

    solanaMocks.sendUsdc.mockRejectedValue(new AmbiguousBroadcastError("sig-help-ambiguous"));

    const res = await call(withdrawal.id);
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(body.transactionHash).toBe("sig-help-ambiguous");

    const finalCampaign = await prisma.helpCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
    const finalWithdrawal = await prisma.helpWithdrawalRequest.findUniqueOrThrow({ where: { id: withdrawal.id } });

    // Not refunded - a blind refund here could double-pay if the
    // transaction actually lands.
    expect(finalCampaign.balance.toNumber()).toBe(0);
    expect(finalWithdrawal.status).toBe("PROCESSING");
    expect(finalWithdrawal.transactionHash).toBe("sig-help-ambiguous");
  });

  it("a failure with no broadcast signature at all is still refunded immediately - nothing could have moved", async () => {
    const { campaign, withdrawal } = await createPendingWithdrawal(11);

    solanaMocks.sendUsdc.mockRejectedValue(new Error("Invalid recipient wallet address."));

    const res = await call(withdrawal.id);
    expect(res.status).toBe(500);

    const finalCampaign = await prisma.helpCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
    const finalWithdrawal = await prisma.helpWithdrawalRequest.findUniqueOrThrow({ where: { id: withdrawal.id } });

    expect(finalWithdrawal.status).toBe("FAILED");
    expect(finalCampaign.balance.toNumber()).toBe(11);
  });

  it("REGRESSION: a finalize failure AFTER sendUsdc() succeeded must NEVER be treated as a failed send (no double loss)", async () => {
    const { campaign, withdrawal } = await createPendingWithdrawal(50);

    solanaMocks.sendUsdc.mockResolvedValue("sig-help-finalize-fails");

    // Force the finalize $transaction to fail for real: helpCampaign's
    // update inside it targets a campaign id that no longer exists,
    // which Prisma rejects with a genuine "record not found" error -
    // the same category of real, unmocked mid-transaction failure used
    // for the sibling creator-withdrawal reject-route regression test.
    const deletedCampaignId = "nonexistent-campaign-id-00000000000";
    const originalFindUnique = prisma.helpWithdrawalRequest.findUnique.bind(prisma.helpWithdrawalRequest);
    const findSpy = vi
      .spyOn(prisma.helpWithdrawalRequest, "findUnique")
      .mockImplementation((async (args: any) => {
        const real = await originalFindUnique(args);
        return real ? { ...real, campaignId: deletedCampaignId } : real;
      }) as unknown as typeof prisma.helpWithdrawalRequest.findUnique);

    let res: Awaited<ReturnType<typeof call>>;
    try {
      res = await call(withdrawal.id);
    } finally {
      // Restore even if call() itself rejects - so a failure here can
      // never leak a corrupted findUnique into a later test.
      findSpy.mockRestore();
    }
    const body = await res.json();

    // Must NOT be treated as a failed transfer - funds already moved.
    expect(res.status).toBe(202);
    expect(body.success).toBeUndefined();
    expect(body.transactionHash).toBe("sig-help-finalize-fails");

    const finalCampaign = await prisma.helpCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
    const finalWithdrawal = await prisma.helpWithdrawalRequest.findUniqueOrThrow({ where: { id: withdrawal.id } });

    // Never refunded - the old code's shared catch block would have
    // refunded this campaign's balance even though the transfer had
    // already succeeded on-chain, a real double loss.
    expect(finalCampaign.balance.toNumber()).toBe(0);
    // The signature was durably recorded despite the finalize failure,
    // so this is recoverable by hand instead of silently lost.
    expect(finalWithdrawal.transactionHash).toBe("sig-help-finalize-fails");
  });

  it("a normal successful transfer still finalizes and reports success (control case)", async () => {
    const { campaign, withdrawal } = await createPendingWithdrawal(20);
    solanaMocks.sendUsdc.mockResolvedValue("sig-help-success");

    const res = await call(withdrawal.id);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const finalCampaign = await prisma.helpCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
    const finalWithdrawal = await prisma.helpWithdrawalRequest.findUniqueOrThrow({ where: { id: withdrawal.id } });
    expect(finalWithdrawal.status).toBe("COMPLETED");
    expect(finalCampaign.totalWithdrawn.toNumber()).toBe(20);
  });
});
