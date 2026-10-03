import { describe, it, expect } from "vitest";
import { Keypair } from "@solana/web3.js";
import {
  deriveCurveKeys,
  bnToBigInt,
  bigIntToBn,
  curveProgressBps,
  formatExactRatio,
  applySlippageDown,
  applySlippageUp,
  bondingCurvePda,
} from "../pump-curve-keys";
import BN from "bn.js";

function mint(seed: number) {
  return Keypair.fromSeed(new Uint8Array(32).fill(seed)).publicKey;
}

describe("deriveCurveKeys", () => {
  it("is fully deterministic and matches bondingCurvePda directly", () => {
    const m = mint(1);
    const keys = deriveCurveKeys(m);
    expect(keys.bondingCurve.toBase58()).toBe(bondingCurvePda(m).toBase58());
    expect(deriveCurveKeys(m).bondingCurve.toBase58()).toBe(keys.bondingCurve.toBase58());
  });
});

describe("bnToBigInt / bigIntToBn", () => {
  it("round-trips large values exactly", () => {
    const big = BigInt("123456789012345678901234567890");
    expect(bnToBigInt(bigIntToBn(big))).toBe(big);
  });

  it("round-trips a BN through bigint", () => {
    const bn = new BN("987654321098765432109876543210");
    expect(bigIntToBn(bnToBigInt(bn)).toString()).toBe(bn.toString());
  });
});

describe("curveProgressBps", () => {
  it("is 0 before any tokens are sold", () => {
    expect(curveProgressBps(BigInt(1_000_000), BigInt(1_000_000))).toBe(0);
  });

  it("is 10_000 (100%) once real token reserves hit zero", () => {
    expect(curveProgressBps(BigInt(0), BigInt(1_000_000))).toBe(10_000);
  });

  it("is 5_000 (50%) at the halfway point", () => {
    expect(curveProgressBps(BigInt(500_000), BigInt(1_000_000))).toBe(5_000);
  });

  it("clamps instead of going negative if real reserves somehow exceed the initial value", () => {
    expect(curveProgressBps(BigInt(2_000_000), BigInt(1_000_000))).toBe(0);
  });

  it("returns 0 for a zero initial-reserves input rather than dividing by zero", () => {
    expect(curveProgressBps(BigInt(0), BigInt(0))).toBe(0);
  });
});

describe("formatExactRatio", () => {
  it("formats an exact integer ratio with no floating-point rounding", () => {
    // 3 quote lamports per 2 token-raw units = 1.5 exactly.
    expect(formatExactRatio(BigInt(3), BigInt(2))).toBe("1.5");
  });

  it("formats a ratio smaller than 1 with leading zero and no exponential notation", () => {
    expect(formatExactRatio(BigInt(1), BigInt(1_000_000_000))).toBe("0.000000001");
  });

  it("handles a whole-number ratio without a trailing decimal point", () => {
    expect(formatExactRatio(BigInt(10), BigInt(5))).toBe("2");
  });

  it("returns 0 for a zero denominator rather than throwing or dividing by zero", () => {
    expect(formatExactRatio(BigInt(5), BigInt(0))).toBe("0");
  });

  it("is precise far beyond what a float64 division could represent", () => {
    // 1 / 3 to 18 digits - a plain JS float division loses precision well
    // before this many digits.
    const result = formatExactRatio(BigInt(1), BigInt(3), 18);
    expect(result).toBe("0.333333333333333333");
  });
});

describe("slippage helpers (shared with cpmm-keys)", () => {
  it("applySlippageUp pads a target SOL amount up by the given bps", () => {
    expect(applySlippageUp(BigInt(1_000_000_000), 100)).toBe(BigInt(1_010_000_000)); // +1%
  });
  it("applySlippageDown pads a minimum SOL amount down by the given bps", () => {
    expect(applySlippageDown(BigInt(1_000_000_000), 100)).toBe(BigInt(990_000_000)); // -1%
  });
});
