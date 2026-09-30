import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { computeTotalAccruedRewardRaw, computeClaimableRewardRaw, type StakingPositionLike, type StakingPoolLike } from "../staking-service";

function position(overrides: Partial<StakingPositionLike> = {}): StakingPositionLike {
  return {
    amountRaw: new Prisma.Decimal("1000000000000"), // 1000 tokens at 9 decimals
    rewardClaimedRaw: new Prisma.Decimal("0"),
    stakedAt: new Date("2026-01-01T00:00:00Z"),
    status: "ACTIVE",
    ...overrides,
  };
}

function pool(apyBasisPoints = 1000): StakingPoolLike {
  return { apyBasisPoints }; // 1000 = 10.00% APY
}

const start = new Date("2026-01-01T00:00:00Z").getTime();
const SECONDS_PER_YEAR = 365 * 24 * 3600;
const at = (secondsAfterStart: number) => new Date(start + secondsAfterStart * 1000);

describe("computeTotalAccruedRewardRaw", () => {
  it("is zero at the instant staking begins", () => {
    expect(computeTotalAccruedRewardRaw(position(), pool(), at(0))).toBe(BigInt(0));
  });

  it("accrues exactly 10% of the staked amount after a full year at 10% APY", () => {
    const reward = computeTotalAccruedRewardRaw(position(), pool(1000), at(SECONDS_PER_YEAR));
    expect(reward).toBe(BigInt("100000000000")); // 10% of 1_000_000_000_000
  });

  it("accrues proportionally for a partial year", () => {
    const reward = computeTotalAccruedRewardRaw(position(), pool(1000), at(SECONDS_PER_YEAR / 2));
    expect(reward).toBe(BigInt("50000000000")); // half of the annual 10%
  });

  it("keeps accruing without a cap for longer holding periods (no lock-related ceiling on rewards)", () => {
    const reward = computeTotalAccruedRewardRaw(position(), pool(1000), at(SECONDS_PER_YEAR * 2));
    expect(reward).toBe(BigInt("200000000000")); // 2 years -> 20%
  });

  it("is zero APY when the pool has 0 basis points", () => {
    expect(computeTotalAccruedRewardRaw(position(), pool(0), at(SECONDS_PER_YEAR))).toBe(BigInt(0));
  });

  it("returns the final claimed amount (not further accrual) for an UNSTAKED position", () => {
    const p = position({ status: "UNSTAKED", rewardClaimedRaw: new Prisma.Decimal("42") });
    expect(computeTotalAccruedRewardRaw(p, pool(1000), at(SECONDS_PER_YEAR))).toBe(BigInt(42));
  });

  it("never goes negative for a stakedAt in the future (defensive clamp)", () => {
    const p = position({ stakedAt: at(1000) });
    expect(computeTotalAccruedRewardRaw(p, pool(1000), at(0))).toBe(BigInt(0));
  });
});

describe("computeClaimableRewardRaw", () => {
  it("subtracts already-claimed rewards from total accrued", () => {
    const p = position({ rewardClaimedRaw: new Prisma.Decimal("30000000000") });
    const claimable = computeClaimableRewardRaw(p, pool(1000), at(SECONDS_PER_YEAR / 2)); // 50000000000 accrued
    expect(claimable).toBe(BigInt("20000000000"));
  });

  it("never returns negative when claimed exceeds accrued (defensive)", () => {
    const p = position({ rewardClaimedRaw: new Prisma.Decimal("999999999999") });
    expect(computeClaimableRewardRaw(p, pool(1000), at(1))).toBe(BigInt(0));
  });

  it("is exact for large stakes - no floating-point drift", () => {
    const p = position({ amountRaw: new Prisma.Decimal("123456789012345678") });
    const claimable = computeClaimableRewardRaw(p, pool(777), at(12345));
    // Same BigInt formula, computed independently here to assert exactness.
    const expected = (BigInt("123456789012345678") * BigInt(777) * BigInt(12345)) / (BigInt(10000) * BigInt(SECONDS_PER_YEAR));
    expect(claimable).toBe(expected);
  });
});
