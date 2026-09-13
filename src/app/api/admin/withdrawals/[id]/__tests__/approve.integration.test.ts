import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

/*
 * ============================================================
 * Regression coverage: ambiguous on-chain outcomes must never
 * trigger a blind refund, and success must never be reported
 * unless durable finalization actually happened.
 * ============================================================
 *
 * BUG 1 (Solana withdrawal safety): the approve route used to refund
 * the withdrawal the instant sendUsdc() threw ANY error, on the theory
 * that a throw means nothing was sent. That's false in general:
 * @solana/spl-token's transfer() calls @solana/web3.js's own
 * sendAndConfirmTransaction() (verified directly in both packages'
 * installed source), which sends the transaction FIRST and separately
 * awaits confirmation - a timeout or RPC hiccup while polling for
 * confirmation throws even though the transfer may already have landed.
 * The SDK itself attaches the broadcast signature to exactly these
 * ambiguous errors (TransactionExpiredTimeoutError, whose own message
 * says "It is unknown if it succeeded or failed") - refunding
 * unconditionally could credit the creator's balance back AND leave a
 * real on-chain transfer standing: a platform funds loss.
 *
 * BUG 2 (finalization semantics): the route always returned
 * {success: true} once sendUsdc() resolved, without checking whether
 * finalizeWithdrawal()'s durable write actually applied. If
 * recordTransactionHash() failed after exhausting its retries (real
 * funds moved, but the signature was never persisted), the route still
 * reported success while the row sat stuck PROCESSING with no matching
 * transactionHash - invisible until someone checked by hand.
 *
 * These tests exercise the REAL route handler against a real Postgres
 * database, mocking only the Solana network boundary.
 */
const solanaMocks = vi.hoisted(() => ({
  sendUsdc: vi.fn(),
  getConnection: vi.fn(),
  getPlatformWalletPublicKey: vi.fn(),
  getUsdcMint: vi.fn(),
}));
vi.mock("@/lib/solana", () => solanaMocks);

vi.mock("@solana/spl-token", () => ({
  getAssociatedTokenAddress: vi.fn(async () => ({ toBase58: () => "PlatformAtaAddress" })),
}));

const { requireAdmin, logAdminAction } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  logAdminAction: vi.fn(),
}));
vi.mock("@/lib/admin", () => ({ requireAdmin }));
vi.mock("@/lib/audit-log", () => ({ logAdminAction }));

import { prisma } from "@/lib/db";
import { POST } from "../approve/route";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

/** An error shaped like @solana/web3.js's TransactionExpiredTimeoutError /
 * TransactionExpiredBlockheightExceededError / SendTransactionError: it
 * carries `.signature` because a transaction WAS broadcast, even though
 * the call that produced it threw. */
class AmbiguousBroadcastError extends Error {
  signature: string;
  constructor(signature: string) {
    super("Transaction was not confirmed in time. It is unknown if it succeeded or failed.");
    this.signature = signature;
  }
}

/** A failure with no signature at all - the transfer never reached the
 * network (invalid recipient, a local signing error, a preflight
 * rejection). */
class PreBroadcastError extends Error {
  constructor() {
    super("Invalid recipient wallet address.");
  }
}

function call(id: string) {
  return POST(
    new NextRequest(`https://zrp.one/api/admin/withdrawals/${id}/approve`, { method: "POST" }),
    { params: Promise.resolve({ id }) }
  );
}

describe.skipIf(!hasRealDatabaseUrl)("POST /api/admin/withdrawals/[id]/approve (integration, real Postgres)", () => {
  const userIds: string[] = [];
  const profileIds: string[] = [];

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
    await prisma.withdrawalRequest.deleteMany({ where: { creatorProfileId: { in: profileIds } } });
    await prisma.creatorProfile.deleteMany({ where: { id: { in: profileIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createPendingWithdrawal(amount: number) {
    const user = await prisma.user.create({
      data: {
        email: `withdrawapprove-${randomUUID().slice(0, 8)}@withdrawtest.example`,
        username: `wappr${randomUUID().slice(0, 8)}`,
        password: "x",
      },
    });
    userIds.push(user.id);

    const profile = await prisma.creatorProfile.create({
      data: { userId: user.id, balance: new Prisma.Decimal(0), totalWithdrawn: new Prisma.Decimal(0) },
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

    return { user, profile, withdrawal };
  }

  describe("BUG 1: an ambiguous broadcast (signature exists, outcome unknown) must never trigger a blind refund", () => {
    it("REGRESSION: sendUsdc() throwing with a broadcast signature does NOT refund - it records the hash and defers to reconciliation", async () => {
      const { profile, withdrawal } = await createPendingWithdrawal(40);

      solanaMocks.sendUsdc.mockRejectedValue(new AmbiguousBroadcastError("sig-ambiguous-fresh"));
      // Solana hasn't indexed it yet (or is still confirming) - "not_found",
      // and the row is fresh, so reconcileWithdrawal must say "still_pending".
      solanaMocks.getConnection.mockReturnValue({ getTransaction: vi.fn().mockResolvedValue(null) });

      const res = await call(withdrawal.id);
      const body = await res.json();

      // Never claims success, never claims definite failure either -
      // the outcome is genuinely unknown right now.
      expect(res.status).toBe(202);
      expect(body.transactionHash).toBe("sig-ambiguous-fresh");

      const finalProfile = await prisma.creatorProfile.findUniqueOrThrow({ where: { id: profile.id } });
      const finalWithdrawal = await prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: withdrawal.id } });

      // The reserved amount was NOT refunded - a blind refund here,
      // while the transfer might still land, would double-pay if it does.
      expect(finalProfile.balance.toNumber()).toBe(0);
      expect(finalWithdrawal.status).toBe("PROCESSING");
      // The durable checkpoint DID happen, even though the outcome is
      // still unresolved - this is what makes reconciliation possible.
      expect(finalWithdrawal.transactionHash).toBe("sig-ambiguous-fresh");
    });

    it("an ambiguous broadcast that Solana confirms actually SUCCEEDED is finalized, not refunded", async () => {
      const { profile, withdrawal } = await createPendingWithdrawal(25);

      solanaMocks.sendUsdc.mockRejectedValue(new AmbiguousBroadcastError("sig-ambiguous-succeeded"));
      solanaMocks.getConnection.mockReturnValue({
        getTransaction: vi.fn().mockResolvedValue({ meta: { err: null } }),
      });

      const res = await call(withdrawal.id);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.transactionHash).toBe("sig-ambiguous-succeeded");

      const finalProfile = await prisma.creatorProfile.findUniqueOrThrow({ where: { id: profile.id } });
      const finalWithdrawal = await prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: withdrawal.id } });

      expect(finalWithdrawal.status).toBe("COMPLETED");
      expect(finalProfile.totalWithdrawn.toNumber()).toBe(25);
      // Balance was never touched a second time - it was already
      // decremented when the withdrawal was first created.
      expect(finalProfile.balance.toNumber()).toBe(0);
    });

    it("an ambiguous broadcast that Solana confirms actually FAILED on-chain is refunded - via reconciliation, not a blind guess", async () => {
      const { profile, withdrawal } = await createPendingWithdrawal(18);

      solanaMocks.sendUsdc.mockRejectedValue(new AmbiguousBroadcastError("sig-ambiguous-failed"));
      solanaMocks.getConnection.mockReturnValue({
        getTransaction: vi.fn().mockResolvedValue({ meta: { err: "InstructionError" } }),
      });

      const res = await call(withdrawal.id);
      expect(res.status).toBe(500);

      const finalProfile = await prisma.creatorProfile.findUniqueOrThrow({ where: { id: profile.id } });
      const finalWithdrawal = await prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: withdrawal.id } });

      expect(finalWithdrawal.status).toBe("FAILED");
      expect(finalProfile.balance.toNumber()).toBe(18);
    });

    it("a failure with NO broadcast signature at all is still refunded immediately - nothing could have moved", async () => {
      const { profile, withdrawal } = await createPendingWithdrawal(9);

      solanaMocks.sendUsdc.mockRejectedValue(new PreBroadcastError());

      const res = await call(withdrawal.id);
      expect(res.status).toBe(500);

      const finalProfile = await prisma.creatorProfile.findUniqueOrThrow({ where: { id: profile.id } });
      const finalWithdrawal = await prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: withdrawal.id } });

      expect(finalWithdrawal.status).toBe("FAILED");
      expect(finalProfile.balance.toNumber()).toBe(9);
      expect(finalWithdrawal.transactionHash).toBeNull();
    });
  });

  describe("BUG 2: success is never reported unless durable finalization actually applied", () => {
    it("REGRESSION: sendUsdc() succeeding but finalizeWithdrawal() not applying must NOT report success", async () => {
      const { profile, withdrawal } = await createPendingWithdrawal(60);

      solanaMocks.sendUsdc.mockResolvedValue("sig-finalize-fails");
      // Simulate finalizeWithdrawal() failing to apply (e.g. because the
      // transactionHash write silently failed) by corrupting the row's
      // transactionHash out from under the route right before it calls
      // finalizeWithdrawal() - the guard `transactionHash: signature`
      // then matches zero rows, exactly as it would for a real
      // recordTransactionHash() failure.
      const originalUpdate = prisma.withdrawalRequest.update.bind(prisma.withdrawalRequest);
      const updateSpy = vi.spyOn(prisma.withdrawalRequest, "update").mockImplementation(((args: any) => {
        if (args?.data?.transactionHash === "sig-finalize-fails") {
          return originalUpdate({ ...args, data: { ...args.data, transactionHash: "sig-DIFFERENT-was-persisted" } });
        }
        return originalUpdate(args);
      }) as unknown as typeof prisma.withdrawalRequest.update);

      const res = await call(withdrawal.id);
      const body = await res.json();
      updateSpy.mockRestore();

      // Must NOT claim success: the durable finalize write never applied.
      expect(res.status).toBe(202);
      expect(body.success).toBeUndefined();

      const finalWithdrawal = await prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: withdrawal.id } });
      const finalProfile = await prisma.creatorProfile.findUniqueOrThrow({ where: { id: profile.id } });

      // The row is genuinely NOT completed - the old code would have
      // told the admin this succeeded while leaving exactly this state.
      expect(finalWithdrawal.status).toBe("PROCESSING");
      expect(finalProfile.totalWithdrawn.toNumber()).toBe(0);
    });

    it("finalizeWithdrawal() applying normally still reports success (control case)", async () => {
      const { profile, withdrawal } = await createPendingWithdrawal(15);
      solanaMocks.sendUsdc.mockResolvedValue("sig-finalize-succeeds");

      const res = await call(withdrawal.id);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);

      const finalWithdrawal = await prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: withdrawal.id } });
      const finalProfile = await prisma.creatorProfile.findUniqueOrThrow({ where: { id: profile.id } });
      expect(finalWithdrawal.status).toBe("COMPLETED");
      expect(finalProfile.totalWithdrawn.toNumber()).toBe(15);
    });

    it("a row already COMPLETED by something else (e.g. a concurrent reconciliation pass) is correctly reported as success, not a false negative", async () => {
      const { withdrawal } = await createPendingWithdrawal(12);
      solanaMocks.sendUsdc.mockResolvedValue("sig-already-completed");

      const originalUpdate = prisma.withdrawalRequest.update.bind(prisma.withdrawalRequest);
      const updateSpy = vi.spyOn(prisma.withdrawalRequest, "update").mockImplementation((async (args: any) => {
        if (args?.data?.transactionHash === "sig-already-completed") {
          // A "concurrent" process finalizes the row with a DIFFERENT
          // signature value stored, then this request's own
          // finalizeWithdrawal() guard (transactionHash: signature) will
          // correctly find zero rows to update - but the row is
          // genuinely COMPLETED, so the route must still report success.
          await prisma.withdrawalRequest.updateMany({
            where: { id: withdrawal.id },
            data: { status: "COMPLETED", transactionHash: "sig-already-completed", processedAt: new Date() },
          });
          return originalUpdate(args);
        }
        return originalUpdate(args);
      }) as unknown as typeof prisma.withdrawalRequest.update);

      const res = await call(withdrawal.id);
      const body = await res.json();
      updateSpy.mockRestore();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
    });
  });
});
