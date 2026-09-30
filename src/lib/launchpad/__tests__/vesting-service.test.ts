import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { computeClaimableRaw, type VestingContractLike } from "../vesting-service";

function contract(overrides: Partial<VestingContractLike> = {}): VestingContractLike {
  return {
    totalAmount: new Prisma.Decimal("1000000000"),
    totalReleased: new Prisma.Decimal("0"),
    cliffSeconds: 100,
    vestingSeconds: 1000,
    startAt: new Date("2026-01-01T00:00:00Z"),
    status: "ACTIVE",
    ...overrides,
  };
}

const start = new Date("2026-01-01T00:00:00Z").getTime();
const at = (secondsAfterStart: number) => new Date(start + secondsAfterStart * 1000);

describe("computeClaimableRaw", () => {
  it("is zero before the cliff", () => {
    expect(computeClaimableRaw(contract(), at(50))).toBe(BigInt(0));
    expect(computeClaimableRaw(contract(), at(99))).toBe(BigInt(0));
  });

  it("is zero exactly at contract start (well before the cliff)", () => {
    expect(computeClaimableRaw(contract(), at(0))).toBe(BigInt(0));
  });

  it("unlocks proportionally to elapsed time after the cliff (linear)", () => {
    // cliff=100, vesting=1000: at t=600, 500s into the 1000s vesting
    // window -> half of totalAmount vested.
    const c = contract();
    const claimable = computeClaimableRaw(c, at(600));
    expect(claimable).toBe(BigInt("500000000")); // exactly half of 1_000_000_000
  });

  it("caps at totalAmount once the full vesting window has elapsed", () => {
    const c = contract();
    expect(computeClaimableRaw(c, at(100 + 1000))).toBe(BigInt("1000000000"));
    expect(computeClaimableRaw(c, at(100 + 1000 + 999999))).toBe(BigInt("1000000000")); // long after, still capped
  });

  it("subtracts already-released amounts from what's newly claimable", () => {
    const c = contract({ totalReleased: new Prisma.Decimal("300000000") });
    const claimable = computeClaimableRaw(c, at(600)); // 500000000 total vested
    expect(claimable).toBe(BigInt("200000000"));
  });

  it("never returns negative when totalReleased exceeds the vested amount (defensive)", () => {
    const c = contract({ totalReleased: new Prisma.Decimal("999999999") });
    expect(computeClaimableRaw(c, at(150))).toBe(BigInt(0)); // vested so far < released
  });

  it("vestingSeconds=0 means fully unlocked the instant the cliff passes (pure cliff)", () => {
    const c = contract({ vestingSeconds: 0 });
    expect(computeClaimableRaw(c, at(99))).toBe(BigInt(0));
    expect(computeClaimableRaw(c, at(100))).toBe(BigInt("1000000000"));
    expect(computeClaimableRaw(c, at(100000))).toBe(BigInt("1000000000"));
  });

  it("cliffSeconds=0 with linear vesting starts accruing immediately", () => {
    const c = contract({ cliffSeconds: 0, vestingSeconds: 1000 });
    expect(computeClaimableRaw(c, at(500))).toBe(BigInt("500000000"));
  });

  it("is zero for a COMPLETED or otherwise non-ACTIVE contract, regardless of math", () => {
    const c = contract({ status: "COMPLETED" });
    expect(computeClaimableRaw(c, at(600))).toBe(BigInt(0));
  });

  it("is exact for large supplies - no floating-point drift", () => {
    // A supply large enough that float math (totalAmount * fraction)
    // would lose precision, but BigInt division does not.
    const c = contract({
      totalAmount: new Prisma.Decimal("123456789012345678"),
      cliffSeconds: 0,
      vestingSeconds: 3,
    });
    // At exactly 1/3 of the way through, BigInt integer division
    // truncates rather than rounding - assert the exact truncated value.
    const claimable = computeClaimableRaw(c, at(1));
    expect(claimable).toBe(BigInt("123456789012345678") / BigInt(3));
  });
});
