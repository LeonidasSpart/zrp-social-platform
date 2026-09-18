import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

/*
 * Coverage for the "withdrawal secondary hardening" finding: this route
 * now converts the raw JS `number` amount to a Prisma.Decimal exactly
 * once, at the boundary (`new Prisma.Decimal(amount)`), and reuses that
 * single value at every call site (the balance check, the decrement, the
 * stored WithdrawalRequest.amount, and the compensating refund on
 * create-failure) instead of letting each site coerce the raw number
 * independently.
 *
 * Honesty note (checked directly, not assumed): for a plain JS number
 * amount with no intervening float arithmetic - exactly what this route
 * receives from `body.amount` - converting it to a Prisma.Decimal once
 * vs. passing the raw number to Prisma at each site is NOT behaviorally
 * distinguishable. `new Prisma.Decimal(n)` and Prisma's own internal
 * coercion of a raw number both go through the same `n.toString()`
 * path, deterministically, every time, for the same n - reverting this
 * specific route's fix and re-running the tests below (verified by
 * hand) produces byte-identical results. So the first test below is
 * NOT a proven old-fails/new-passes regression test; it's an invariant
 * check that documents and locks in the correct behavior (a single
 * source of truth for the amount, immune to a FUTURE call site that
 * introduces real float arithmetic - e.g. a fee split - independently
 * drifting from the others), matching this fix's actual value: defensive
 * correctness against future changes, not a currently-reproducible bug
 * in this route today. The concurrent-reservation and
 * compensating-refund tests below cover pre-existing protections
 * (the conditional `updateMany` reservation, and the refund-on-create-
 * failure path) that predate this specific change and are included here
 * as coverage for the route as a whole, not as new regressions this fix
 * introduces.
 */
const { getVerifiedToken } = vi.hoisted(() => ({ getVerifiedToken: vi.fn() }));
// Partial mock (spreads the real module) rather than a full
// replacement - a full replacement here would silently leave any
// other export (e.g. isBlockedEitherWay, used internally by
// src/lib/notifications.ts) undefined for any code path that
// reaches it, which is exactly what broke a sibling test the same
// way (see the PR that introduced this comment).
vi.mock("@/lib/auth-guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-guards")>();
  return { ...actual, getVerifiedToken };
});

import { prisma } from "@/lib/db";
import { POST } from "../route";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

let ipCounter = 1;
function call(userId: string, body: unknown) {
  getVerifiedToken.mockResolvedValue({ id: userId });
  ipCounter += 1;
  return POST(
    new NextRequest("https://zrp.one/api/creator/withdraw", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": `10.${(ipCounter >> 8) & 255}.${ipCounter & 255}.7`,
      },
      body: JSON.stringify(body),
    })
  );
}

describe.skipIf(!hasRealDatabaseUrl)("POST /api/creator/withdraw (integration, real Postgres)", () => {
  const userIds: string[] = [];
  const profileIds: string[] = [];

  afterAll(async () => {
    await prisma.withdrawalRequest.deleteMany({ where: { creatorProfileId: { in: profileIds } } });
    await prisma.creatorProfile.deleteMany({ where: { id: { in: profileIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createProfile(balance: number, opts: { verifiedSolanaWallet?: string | null } = {}) {
    const user = await prisma.user.create({
      data: {
        email: `withdraw-${randomUUID().slice(0, 8)}@withdrawtest.example`,
        username: `wdraw${randomUUID().slice(0, 8)}`,
        password: "x",
        // Default to a linked wallet so tests not specifically about
        // the binding requirement don't have to think about it -
        // matches a real creator who has already completed
        // /api/wallet/link-challenge + link-verify.
        verifiedSolanaWallet:
          opts.verifiedSolanaWallet === undefined
            ? `Verified${randomUUID().replace(/-/g, "").slice(0, 32)}`
            : opts.verifiedSolanaWallet,
      },
    });
    userIds.push(user.id);

    const profile = await prisma.creatorProfile.create({
      data: { userId: user.id, balance: new Prisma.Decimal(balance) },
    });
    profileIds.push(profile.id);

    return { user, profile };
  }

  it("INVARIANT: a fractional amount decrements the balance and stores the withdrawal amount as the EXACT same Decimal value - no per-call-site drift", async () => {
    const { user, profile } = await createProfile(100.5);

    // 33.33 has no exact binary float representation - if the balance
    // check, the decrement, and the stored amount each independently
    // converted this raw number to a Decimal, any tiny inconsistency
    // between them would show up here.
    const res = await call(user.id, { amount: 33.33 });
    expect(res.status).toBe(200);

    const finalProfile = await prisma.creatorProfile.findUniqueOrThrow({ where: { id: profile.id } });
    const withdrawal = await prisma.withdrawalRequest.findFirstOrThrow({ where: { creatorProfileId: profile.id } });

    expect(withdrawal.amount.toString()).toBe("33.33");
    expect(finalProfile.balance.toString()).toBe("67.17");

    // The invariant this fix guarantees: decrementing by the STORED
    // amount and then crediting it straight back must land EXACTLY on
    // the original balance, with no rounding remainder.
    const restored = finalProfile.balance.plus(withdrawal.amount);
    expect(restored.toString()).toBe("100.5");
  });

  it("a compensating refund after a create-failure restores the EXACT pre-reservation balance", async () => {
    const { user, profile } = await createProfile(50);

    // Force withdrawalRequest.create to fail (a duplicate/invalid
    // walletAddress constraint isn't available here, so simulate the
    // documented failure path directly): temporarily break the create
    // call by requesting a wallet address value the schema rejects
    // (null is disallowed by TypeScript but not by a raw Prisma call
    // bypassed through a bad type) - instead, drive the same code path
    // by spying on prisma.withdrawalRequest.create for this one call.
    const createSpy = vi
      .spyOn(prisma.withdrawalRequest, "create")
      .mockRejectedValueOnce(new Error("simulated create failure"));

    const res = await call(user.id, { amount: 12.7 });
    expect(res.status).toBe(500);
    createSpy.mockRestore();

    const finalProfile = await prisma.creatorProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(finalProfile.balance.toString()).toBe("50");
  });

  it("two concurrent withdrawals against an insufficient shared balance: only one can be reserved", async () => {
    const { user, profile } = await createProfile(10);

    const [resA, resB] = await Promise.all([
      call(user.id, { amount: 8 }),
      call(user.id, { amount: 8 }),
    ]);
    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 400]);

    const finalProfile = await prisma.creatorProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(finalProfile.balance.toString()).toBe("2");
  });

  /*
   * Regression coverage for N1: the withdrawal destination used to come
   * straight from the request body (`body.walletAddress`), stored
   * as-is and later paid out verbatim by the admin approval route's
   * sendUsdc() call - no check that it matched anything the requesting
   * user had proven they controlled. Anyone who could make one
   * authenticated POST here could redirect a creator's balance to an
   * arbitrary address. The fix: the destination is always the user's
   * own cryptographically verified wallet (User.verifiedSolanaWallet,
   * set only via a real signature check in /api/wallet/link-verify -
   * see src/lib/wallet-link.ts), never a client-supplied value.
   */
  describe("withdrawal destination is bound to the verified wallet (N1)", () => {
    it("stores the withdrawal against the user's verified wallet, not a client-supplied address", async () => {
      const { user, profile } = await createProfile(20);
      const res = await call(user.id, { amount: 5 });
      expect(res.status).toBe(200);

      const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      const withdrawal = await prisma.withdrawalRequest.findFirstOrThrow({ where: { creatorProfileId: profile.id } });
      expect(withdrawal.walletAddress).toBe(dbUser.verifiedSolanaWallet);
    });

    it("a client-supplied walletAddress in the request body is ignored, not used as the destination", async () => {
      const { user, profile } = await createProfile(20);
      const attackerWallet = "AttackerControlledWallet11111111";

      const res = await call(user.id, { amount: 5, walletAddress: attackerWallet });
      expect(res.status).toBe(200);

      const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      const withdrawal = await prisma.withdrawalRequest.findFirstOrThrow({ where: { creatorProfileId: profile.id } });
      expect(withdrawal.walletAddress).toBe(dbUser.verifiedSolanaWallet);
      expect(withdrawal.walletAddress).not.toBe(attackerWallet);
    });

    it("rejects the withdrawal (and reserves nothing) when the user has no verified wallet linked", async () => {
      const { user, profile } = await createProfile(20, { verifiedSolanaWallet: null });

      const res = await call(user.id, { amount: 5 });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/link and verify a solana wallet/i);

      // No balance should have been reserved for a request that was
      // always going to be rejected.
      const finalProfile = await prisma.creatorProfile.findUniqueOrThrow({ where: { id: profile.id } });
      expect(finalProfile.balance.toString()).toBe("20");
    });
  });
});
