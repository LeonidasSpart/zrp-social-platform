import { describe, it, expect, vi, afterAll, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/*
 * ============================================================
 * Crash-safety regression coverage for src/lib/withdrawals.ts
 * ============================================================
 *
 * The bug this module fixes: an approved withdrawal used to do
 * sendUsdc() (moves real funds) followed by ONE $transaction that
 * recorded the signature, marked COMPLETED, and credited
 * totalWithdrawn - all as a single unit, run entirely AFTER the funds
 * were already sent. A process killed between "funds sent" and "that
 * $transaction commits" left the row PROCESSING forever with no
 * transactionHash anywhere - unrecoverable without reading Solana by
 * hand.
 *
 * These tests prove, against a real Postgres database:
 *   1. finalizeWithdrawal() and failAndRefundWithdrawal() are each
 *      idempotent - calling either twice for the same withdrawal only
 *      ever applies its balance effect once.
 *   2. reconcileWithdrawal() correctly recovers a withdrawal left
 *      exactly where a crash would leave it (PROCESSING, with or
 *      without a recorded transactionHash), for every outcome Solana
 *      could report - using a mocked @/lib/solana so this doesn't
 *      depend on real network access.
 *   3. The specific historical bug - two sequential non-transactional
 *      writes for the SAME logical operation - is proven fixed by
 *      reproducing the crash window directly: call recordTransactionHash()
 *      and then simulate the crash (never call finalizeWithdrawal()
 *      from the route), and show reconcileWithdrawal() alone can still
 *      bring the row to a correct, consistent COMPLETED state.
 */

const solanaMocks = vi.hoisted(() => ({
  getConnection: vi.fn(),
  getPlatformWalletPublicKey: vi.fn(),
  getUsdcMint: vi.fn(),
}));
vi.mock("@/lib/solana", () => solanaMocks);

vi.mock("@solana/spl-token", () => ({
  getAssociatedTokenAddress: vi.fn(async () => ({
    toBase58: () => "PlatformAtaAddress",
  })),
}));

import {
  finalizeWithdrawal,
  failAndRefundWithdrawal,
  reconcileWithdrawal,
  NO_HASH_RECONCILE_AFTER_MS,
} from "../withdrawals";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

describe.skipIf(!hasRealDatabaseUrl)("withdrawal crash-safety (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const profileIds: string[] = [];
  const withdrawalIds: string[] = [];

  afterAll(async () => {
    await prisma.withdrawalRequest.deleteMany({ where: { id: { in: withdrawalIds } } });
    await prisma.creatorProfile.deleteMany({ where: { id: { in: profileIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  beforeEach(() => {
    solanaMocks.getConnection.mockReset();
    solanaMocks.getPlatformWalletPublicKey.mockReset();
    solanaMocks.getUsdcMint.mockReset();
    solanaMocks.getPlatformWalletPublicKey.mockReturnValue({ toBase58: () => "PlatformWallet" });
    solanaMocks.getUsdcMint.mockReturnValue({ toBase58: () => "UsdcMintAddress" });
  });

  async function createProfile(startingBalance: number, totalWithdrawn = 0) {
    const user = await prisma.user.create({
      data: {
        email: `withdrawtest-${randomUUID().slice(0, 8)}@withdrawtest.example`,
        username: `wtest${randomUUID().slice(0, 10)}`,
        password: "x",
      },
    });
    userIds.push(user.id);

    const profile = await prisma.creatorProfile.create({
      data: {
        userId: user.id,
        balance: new Prisma.Decimal(startingBalance),
        totalWithdrawn: new Prisma.Decimal(totalWithdrawn),
      },
    });
    profileIds.push(profile.id);
    return { user, profile };
  }

  async function createProcessingWithdrawal(
    profileId: string,
    userId: string,
    amount: number,
    opts: { transactionHash?: string | null; updatedAt?: Date } = {}
  ) {
    const withdrawal = await prisma.withdrawalRequest.create({
      data: {
        creatorProfileId: profileId,
        userId,
        amount: new Prisma.Decimal(amount),
        walletAddress: "RecipientWalletAddress111111111111111111111",
        status: "PROCESSING",
        transactionHash: opts.transactionHash ?? null,
      },
    });
    withdrawalIds.push(withdrawal.id);

    if (opts.updatedAt) {
      // updatedAt is server-managed by Prisma (@updatedAt) - force it
      // backdated with a raw query so tests can simulate "stuck a while
      // ago" without a real sleep.
      await prisma.$executeRaw`UPDATE "WithdrawalRequest" SET "updatedAt" = ${opts.updatedAt} WHERE id = ${withdrawal.id}`;
    }

    return prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: withdrawal.id } });
  }

  describe("finalizeWithdrawal idempotency", () => {
    it("credits totalWithdrawn exactly once even when called twice for the same signature", async () => {
      const { profile, user } = await createProfile(0, 100);
      const withdrawal = await createProcessingWithdrawal(profile.id, user.id, 50, {
        transactionHash: "sig-finalize-once",
      });

      const first = await finalizeWithdrawal(withdrawal.id, "sig-finalize-once");
      expect(first).toBe(true);

      const second = await finalizeWithdrawal(withdrawal.id, "sig-finalize-once");
      expect(second).toBe(false); // already resolved - no-op

      const finalProfile = await prisma.creatorProfile.findUniqueOrThrow({ where: { id: profile.id } });
      expect(finalProfile.totalWithdrawn.toNumber()).toBe(150); // credited ONCE, not twice

      const finalWithdrawal = await prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: withdrawal.id } });
      expect(finalWithdrawal.status).toBe("COMPLETED");
    });

    it("refuses to finalize against a mismatched signature", async () => {
      const { profile, user } = await createProfile(0, 0);
      const withdrawal = await createProcessingWithdrawal(profile.id, user.id, 20, {
        transactionHash: "sig-real",
      });

      const result = await finalizeWithdrawal(withdrawal.id, "sig-wrong");
      expect(result).toBe(false);

      const finalProfile = await prisma.creatorProfile.findUniqueOrThrow({ where: { id: profile.id } });
      expect(finalProfile.totalWithdrawn.toNumber()).toBe(0);
    });
  });

  describe("failAndRefundWithdrawal idempotency", () => {
    it("refunds the balance exactly once even when called twice", async () => {
      const { profile, user } = await createProfile(0, 0);
      const withdrawal = await createProcessingWithdrawal(profile.id, user.id, 30);

      const first = await failAndRefundWithdrawal(withdrawal.id, "test failure");
      expect(first).toBe(true);

      const second = await failAndRefundWithdrawal(withdrawal.id, "test failure");
      expect(second).toBe(false);

      const finalProfile = await prisma.creatorProfile.findUniqueOrThrow({ where: { id: profile.id } });
      expect(finalProfile.balance.toNumber()).toBe(30); // refunded ONCE, not twice

      const finalWithdrawal = await prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: withdrawal.id } });
      expect(finalWithdrawal.status).toBe("FAILED");
    });
  });

  describe("reconcileWithdrawal - the crash-recovery decision tree", () => {
    it("finalizes a withdrawal whose transactionHash is confirmed successful on-chain (the historical bug, reproduced and fixed)", async () => {
      // This is exactly the crash window the old code could not survive:
      // sendUsdc() succeeded, recordTransactionHash() ran, and then the
      // process died BEFORE finalizeWithdrawal() ever got called from the
      // route. Nothing here calls finalizeWithdrawal() directly - only
      // reconcileWithdrawal(), simulating a later pass finding this row
      // exactly as a crash would have left it.
      solanaMocks.getConnection.mockReturnValue({
        getTransaction: vi.fn(async () => ({ meta: { err: null } })),
      });

      const { profile, user } = await createProfile(0, 0);
      const withdrawal = await createProcessingWithdrawal(profile.id, user.id, 75, {
        transactionHash: "sig-crashed-before-finalize",
      });

      const outcome = await reconcileWithdrawal(withdrawal);
      expect(outcome).toBe("finalized");

      const finalWithdrawal = await prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: withdrawal.id } });
      expect(finalWithdrawal.status).toBe("COMPLETED");

      const finalProfile = await prisma.creatorProfile.findUniqueOrThrow({ where: { id: profile.id } });
      expect(finalProfile.totalWithdrawn.toNumber()).toBe(75);
    });

    it("fails and refunds a withdrawal whose transactionHash failed on-chain", async () => {
      solanaMocks.getConnection.mockReturnValue({
        getTransaction: vi.fn(async () => ({ meta: { err: { InstructionError: [0, "Custom"] } } })),
      });

      const { profile, user } = await createProfile(0, 0);
      const withdrawal = await createProcessingWithdrawal(profile.id, user.id, 40, {
        transactionHash: "sig-onchain-failed",
      });

      const outcome = await reconcileWithdrawal(withdrawal);
      expect(outcome).toBe("failed_and_refunded");

      const finalProfile = await prisma.creatorProfile.findUniqueOrThrow({ where: { id: profile.id } });
      expect(finalProfile.balance.toNumber()).toBe(40);
    });

    it("leaves a recently-submitted, not-yet-found transactionHash alone (still legitimately in flight)", async () => {
      solanaMocks.getConnection.mockReturnValue({
        getTransaction: vi.fn(async () => null),
      });

      const { profile, user } = await createProfile(0, 0);
      const withdrawal = await createProcessingWithdrawal(profile.id, user.id, 10, {
        transactionHash: "sig-still-propagating",
        updatedAt: new Date(), // just now - well within the patience window
      });

      const outcome = await reconcileWithdrawal(withdrawal);
      expect(outcome).toBe("still_pending");

      const finalWithdrawal = await prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: withdrawal.id } });
      expect(finalWithdrawal.status).toBe("PROCESSING"); // untouched
    });

    it("fails and refunds a transactionHash that never landed after the patience window passes", async () => {
      solanaMocks.getConnection.mockReturnValue({
        getTransaction: vi.fn(async () => null),
      });

      const { profile, user } = await createProfile(0, 0);
      const withdrawal = await createProcessingWithdrawal(profile.id, user.id, 15, {
        transactionHash: "sig-dropped",
        updatedAt: new Date(Date.now() - NO_HASH_RECONCILE_AFTER_MS - 1000),
      });

      const outcome = await reconcileWithdrawal(withdrawal);
      expect(outcome).toBe("failed_and_refunded");

      const finalProfile = await prisma.creatorProfile.findUniqueOrThrow({ where: { id: profile.id } });
      expect(finalProfile.balance.toNumber()).toBe(15);
    });

    it("leaves a withdrawal with NO transactionHash alone while still within the patience window (may just be mid-request)", async () => {
      const { profile, user } = await createProfile(0, 0);
      const withdrawal = await createProcessingWithdrawal(profile.id, user.id, 5, {
        transactionHash: null,
        updatedAt: new Date(),
      });

      const outcome = await reconcileWithdrawal(withdrawal);
      expect(outcome).toBe("still_pending");
      expect(solanaMocks.getConnection).not.toHaveBeenCalled();
    });

    it("recovers via wallet-history match when the process crashed before ever recording a signature", async () => {
      const recipientAddress = "RecipientWalletAddress111111111111111111111";
      solanaMocks.getConnection.mockReturnValue({
        getSignaturesForAddress: vi.fn(async () => [
          { signature: "sig-found-by-heuristic", err: null, blockTime: Math.floor(Date.now() / 1000) },
        ]),
        getTransaction: vi.fn(async () => ({
          meta: {
            err: null,
            preTokenBalances: [
              { accountIndex: 1, mint: "UsdcMintAddress", owner: recipientAddress, uiTokenAmount: { uiAmount: 0 } },
            ],
            postTokenBalances: [
              { accountIndex: 1, mint: "UsdcMintAddress", owner: recipientAddress, uiTokenAmount: { uiAmount: 60 } },
            ],
          },
          transaction: { message: {} },
        })),
      });

      const { profile, user } = await createProfile(0, 0);
      const withdrawal = await createProcessingWithdrawal(profile.id, user.id, 60, {
        transactionHash: null,
        updatedAt: new Date(Date.now() - NO_HASH_RECONCILE_AFTER_MS - 1000),
      });

      const outcome = await reconcileWithdrawal(withdrawal);
      expect(outcome).toBe("finalized");

      const finalWithdrawal = await prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: withdrawal.id } });
      expect(finalWithdrawal.status).toBe("COMPLETED");
      expect(finalWithdrawal.transactionHash).toBe("sig-found-by-heuristic");

      const finalProfile = await prisma.creatorProfile.findUniqueOrThrow({ where: { id: profile.id } });
      expect(finalProfile.totalWithdrawn.toNumber()).toBe(60);
    });

    it("safely refunds when no transactionHash was ever recorded AND no matching on-chain transfer exists after the wait", async () => {
      solanaMocks.getConnection.mockReturnValue({
        getSignaturesForAddress: vi.fn(async () => []),
      });

      const { profile, user } = await createProfile(0, 0);
      const withdrawal = await createProcessingWithdrawal(profile.id, user.id, 25, {
        transactionHash: null,
        updatedAt: new Date(Date.now() - NO_HASH_RECONCILE_AFTER_MS - 1000),
      });

      const outcome = await reconcileWithdrawal(withdrawal);
      expect(outcome).toBe("failed_and_refunded");

      const finalProfile = await prisma.creatorProfile.findUniqueOrThrow({ where: { id: profile.id } });
      expect(finalProfile.balance.toNumber()).toBe(25);
    });

    it("is a no-op for a withdrawal that isn't PROCESSING", async () => {
      const { profile, user } = await createProfile(0, 0);
      const withdrawal = await prisma.withdrawalRequest.create({
        data: {
          creatorProfileId: profile.id,
          userId: user.id,
          amount: new Prisma.Decimal(10),
          walletAddress: "SomeWallet",
          status: "COMPLETED",
          transactionHash: "already-done",
        },
      });
      withdrawalIds.push(withdrawal.id);

      const outcome = await reconcileWithdrawal(withdrawal);
      expect(outcome).toBe("already_resolved");
      expect(solanaMocks.getConnection).not.toHaveBeenCalled();
    });
  });
});
