import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  computeNftTotalAccruedRewardRaw,
  computeNftClaimableRewardRaw,
  type NftStakingPositionLike,
  type NftStakingPoolLike,
} from "../nft-staking-service";

function position(overrides: Partial<NftStakingPositionLike> = {}): NftStakingPositionLike {
  return {
    rewardClaimedRaw: new Prisma.Decimal("0"),
    stakedAt: new Date("2026-01-01T00:00:00Z"),
    status: "ACTIVE",
    ...overrides,
  };
}

function pool(rewardRatePerDayRaw = "1000000"): NftStakingPoolLike {
  return { rewardRatePerDayRaw: new Prisma.Decimal(rewardRatePerDayRaw) };
}

const start = new Date("2026-01-01T00:00:00Z").getTime();
const at = (secondsAfterStart: number) => new Date(start + secondsAfterStart * 1000);

describe("computeNftTotalAccruedRewardRaw", () => {
  it("is zero at the instant staking begins", () => {
    expect(computeNftTotalAccruedRewardRaw(position(), pool(), at(0))).toBe(BigInt(0));
  });

  it("accrues exactly one day's rate after exactly one day", () => {
    const reward = computeNftTotalAccruedRewardRaw(position(), pool("1000000"), at(86400));
    expect(reward).toBe(BigInt(1_000_000));
  });

  it("accrues proportionally for a partial day", () => {
    const reward = computeNftTotalAccruedRewardRaw(position(), pool("1000000"), at(43200)); // half a day
    expect(reward).toBe(BigInt(500_000));
  });

  it("keeps accruing without a cap for longer holding periods", () => {
    const reward = computeNftTotalAccruedRewardRaw(position(), pool("1000000"), at(86400 * 10));
    expect(reward).toBe(BigInt(10_000_000));
  });

  it("is zero reward when the pool's rate is 0", () => {
    expect(computeNftTotalAccruedRewardRaw(position(), pool("0"), at(86400))).toBe(BigInt(0));
  });

  it("returns the final claimed amount (not further accrual) for an UNSTAKED position", () => {
    const p = position({ status: "UNSTAKED", rewardClaimedRaw: new Prisma.Decimal("42") });
    expect(computeNftTotalAccruedRewardRaw(p, pool("1000000"), at(86400))).toBe(BigInt(42));
  });

  it("never goes negative for a stakedAt in the future (defensive clamp)", () => {
    const p = position({ stakedAt: at(1000) });
    expect(computeNftTotalAccruedRewardRaw(p, pool("1000000"), at(0))).toBe(BigInt(0));
  });
});

describe("computeNftClaimableRewardRaw", () => {
  it("subtracts already-claimed rewards from total accrued", () => {
    const p = position({ rewardClaimedRaw: new Prisma.Decimal("300000") });
    const claimable = computeNftClaimableRewardRaw(p, pool("1000000"), at(43200)); // 500000 accrued
    expect(claimable).toBe(BigInt(200_000));
  });

  it("never returns negative when claimed exceeds accrued (defensive)", () => {
    const p = position({ rewardClaimedRaw: new Prisma.Decimal("999999999999") });
    expect(computeNftClaimableRewardRaw(p, pool("1000000"), at(1))).toBe(BigInt(0));
  });

  it("is exact for large rates and long durations - no floating-point drift", () => {
    const p = position();
    const claimable = computeNftClaimableRewardRaw(p, pool("123456789012345"), at(9876543));
    const expected = (BigInt("123456789012345") * BigInt(9876543)) / BigInt(86400);
    expect(claimable).toBe(expected);
  });
});
