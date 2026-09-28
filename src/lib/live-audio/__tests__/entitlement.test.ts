import { describe, it, expect, vi, beforeEach } from "vitest";

const { findUniqueUser, findUniqueSubscription } = vi.hoisted(() => ({
  findUniqueUser: vi.fn(),
  findUniqueSubscription: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: findUniqueUser },
    subscription: { findUnique: findUniqueSubscription },
  },
}));

import { checkLiveAudioAccess, requireLiveAudioAccess } from "../entitlement";
import { LiveAudioError } from "../errors";

const FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const PAST = new Date(Date.now() - 60 * 1000);

describe("checkLiveAudioAccess - the paid-entitlement gate", () => {
  beforeEach(() => {
    findUniqueUser.mockReset();
    findUniqueSubscription.mockReset();
  });

  it("denies a free user with no Subscription row at all (the overwhelming common case)", async () => {
    findUniqueUser.mockResolvedValue({ plan: "free" });
    findUniqueSubscription.mockResolvedValue(null);

    const result = await checkLiveAudioAccess("u1");
    expect(result).toEqual({ allowed: false, plan: "free", reason: "free_plan" });
  });

  for (const plan of ["pro", "business", "enterprise"]) {
    it(`allows ${plan} with an ACTIVE monthly Subscription whose period hasn't ended`, async () => {
      findUniqueUser.mockResolvedValue({ plan });
      findUniqueSubscription.mockResolvedValue({
        plan,
        status: "ACTIVE",
        currentPeriodEnd: FUTURE,
      });

      const result = await checkLiveAudioAccess("u2");
      expect(result).toEqual({ allowed: true, plan });
    });

    it(`allows ${plan} with an ACTIVE YEARLY Subscription (yearly billing must not be treated differently)`, async () => {
      findUniqueUser.mockResolvedValue({ plan });
      findUniqueSubscription.mockResolvedValue({
        plan,
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 300 * 24 * 60 * 60 * 1000),
      });

      const result = await checkLiveAudioAccess("u2y");
      expect(result).toEqual({ allowed: true, plan });
    });
  }

  it("denies an ACTIVE subscription whose currentPeriodEnd has already passed (cron-lag window, before the hourly expiry sweep runs)", async () => {
    findUniqueUser.mockResolvedValue({ plan: "pro" });
    findUniqueSubscription.mockResolvedValue({
      plan: "pro",
      status: "ACTIVE",
      currentPeriodEnd: PAST,
    });

    const result = await checkLiveAudioAccess("u3");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("subscription_expired");
  });

  it("denies a Subscription row already swept to EXPIRED", async () => {
    findUniqueUser.mockResolvedValue({ plan: "free" });
    findUniqueSubscription.mockResolvedValue({
      plan: "pro",
      status: "EXPIRED",
      currentPeriodEnd: PAST,
    });

    const result = await checkLiveAudioAccess("u4");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("subscription_not_active");
  });

  it("denies a CANCELED Subscription even if currentPeriodEnd is technically still in the future", async () => {
    findUniqueUser.mockResolvedValue({ plan: "free" });
    findUniqueSubscription.mockResolvedValue({
      plan: "pro",
      status: "CANCELED",
      currentPeriodEnd: FUTURE,
    });

    const result = await checkLiveAudioAccess("u5");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("subscription_not_active");
  });

  it("denies a PENDING Subscription (created but never granted a paid period)", async () => {
    findUniqueUser.mockResolvedValue({ plan: "free" });
    findUniqueSubscription.mockResolvedValue({
      plan: "pro",
      status: "PENDING",
      currentPeriodEnd: null,
    });

    const result = await checkLiveAudioAccess("u6");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("subscription_not_active");
  });

  it("allows the legacy-paid reconciliation bucket: no Subscription row, but User.plan is a real paid plan (docs/subscriptions.md NO_SUBSCRIPTION bucket)", async () => {
    findUniqueUser.mockResolvedValue({ plan: "business" });
    findUniqueSubscription.mockResolvedValue(null);

    const result = await checkLiveAudioAccess("u7");
    expect(result).toEqual({ allowed: true, plan: "business" });
  });

  it("fails closed for a nonexistent user", async () => {
    findUniqueUser.mockResolvedValue(null);
    findUniqueSubscription.mockResolvedValue(null);

    const result = await checkLiveAudioAccess("ghost");
    expect(result.allowed).toBe(false);
  });

  it("an unrecognized plan string on the Subscription row falls back to free (fail closed, never an unknown-plan bypass)", async () => {
    findUniqueUser.mockResolvedValue({ plan: "free" });
    findUniqueSubscription.mockResolvedValue({
      plan: "totally-not-a-real-plan",
      status: "ACTIVE",
      currentPeriodEnd: FUTURE,
    });

    const result = await checkLiveAudioAccess("u8");
    expect(result.allowed).toBe(false);
    expect(result.plan).toBe("free");
  });
});

describe("requireLiveAudioAccess - the throwing form room-service.ts calls", () => {
  beforeEach(() => {
    findUniqueUser.mockReset();
    findUniqueSubscription.mockReset();
  });

  it("throws a LiveAudioError with the paywall code for a denied user", async () => {
    findUniqueUser.mockResolvedValue({ plan: "free" });
    findUniqueSubscription.mockResolvedValue(null);

    await expect(requireLiveAudioAccess("free-user")).rejects.toBeInstanceOf(LiveAudioError);
    await expect(requireLiveAudioAccess("free-user")).rejects.toMatchObject({
      code: "live_audio_paid_feature",
      status: 403,
    });
  });

  it("resolves without throwing for an entitled user", async () => {
    findUniqueUser.mockResolvedValue({ plan: "pro" });
    findUniqueSubscription.mockResolvedValue({ plan: "pro", status: "ACTIVE", currentPeriodEnd: FUTURE });

    await expect(requireLiveAudioAccess("pro-user")).resolves.toBeUndefined();
  });
});
