import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, NATIVE_MINT } from "@solana/spl-token";
import {
  sortMints,
  deriveCreatePoolKeys,
  computeDepositLpAmount,
  computeWithdrawAmounts,
  applySlippageDown,
  applySlippageUp,
} from "../cpmm-keys";

// Any syntactically valid mint pubkey works for these pure, offline
// derivations - a fixed, deterministically-seeded keypair keeps the test
// itself deterministic without depending on a real on-chain mint.
const TOKEN_MINT = Keypair.fromSeed(new Uint8Array(32).fill(7)).publicKey;

describe("sortMints", () => {
  it("picks the numerically smaller pubkey as mintA, regardless of call order", () => {
    const a = sortMints(TOKEN_MINT, TOKEN_PROGRAM_ID, NATIVE_MINT, TOKEN_PROGRAM_ID);
    const b = sortMints(NATIVE_MINT, TOKEN_PROGRAM_ID, TOKEN_MINT, TOKEN_PROGRAM_ID);
    expect(a.mintA.toBase58()).toBe(b.mintA.toBase58());
    expect(a.mintB.toBase58()).toBe(b.mintB.toBase58());
    // Whichever buffer compares smaller must win regardless of argument order.
    expect(Buffer.compare(a.mintA.toBuffer(), a.mintB.toBuffer())).toBeLessThan(0);
  });

  it("reports which side of the pair was the 'first' argument", () => {
    const smaller = Buffer.compare(TOKEN_MINT.toBuffer(), NATIVE_MINT.toBuffer()) < 0 ? TOKEN_MINT : NATIVE_MINT;
    const result = sortMints(TOKEN_MINT, TOKEN_PROGRAM_ID, NATIVE_MINT, TOKEN_PROGRAM_ID);
    expect(result.xIsA).toBe(TOKEN_MINT.equals(smaller));
  });
});

describe("deriveCreatePoolKeys", () => {
  it("is fully deterministic - the same inputs always derive the same pool", () => {
    const first = deriveCreatePoolKeys(TOKEN_MINT, TOKEN_PROGRAM_ID, NATIVE_MINT);
    const second = deriveCreatePoolKeys(TOKEN_MINT, TOKEN_PROGRAM_ID, NATIVE_MINT);
    expect(first.poolId.toBase58()).toBe(second.poolId.toBase58());
    expect(first.lpMint.toBase58()).toBe(second.lpMint.toBase58());
    expect(first.vaultA.toBase58()).toBe(second.vaultA.toBase58());
    expect(first.vaultB.toBase58()).toBe(second.vaultB.toBase58());
  });

  it("documents that the pool PDA depends only on (config, mintA, mintB) - not on which program owns the mint", () => {
    const classic = deriveCreatePoolKeys(TOKEN_MINT, TOKEN_PROGRAM_ID, NATIVE_MINT);
    const token2022 = deriveCreatePoolKeys(TOKEN_MINT, TOKEN_2022_PROGRAM_ID, NATIVE_MINT);
    // The token PROGRAM (classic vs Token-2022) is tracked separately by
    // callers (e.g. mintProgramA/B passed to the create-pool instruction)
    // and is never itself part of the pool PDA's seeds - this test exists
    // so a future change that tried to fold it in would fail loudly here
    // rather than silently deriving a pool address nothing else agrees on.
    expect(classic.poolId.toBase58()).toBe(token2022.poolId.toBase58());
  });

  it("produces a pool id matching Raydium's own real mainnet standard fee-tier config", () => {
    const keys = deriveCreatePoolKeys(TOKEN_MINT, TOKEN_PROGRAM_ID, NATIVE_MINT);
    expect(keys.configId.toBase58()).toBe("D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2");
  });
});

describe("computeDepositLpAmount", () => {
  it("mints LP proportional to the smaller of the two deposit ratios", () => {
    // Pool has 1000:2000 reserves (price 2 quote per base), 100 LP supply.
    // Depositing 100 base (10% of reserveA) and only 150 quote (7.5% of
    // reserveB) should mint LP based on the limiting (quote) side.
    const lp = computeDepositLpAmount(BigInt(1000), BigInt(2000), BigInt(100), BigInt(100), BigInt(150));
    expect(lp).toBe(BigInt(7)); // floor(150*100/2000) = 7, vs floor(100*100/1000) = 10
  });

  it("throws on an empty pool rather than dividing by zero", () => {
    expect(() => computeDepositLpAmount(BigInt(0), BigInt(0), BigInt(0), BigInt(10), BigInt(10))).toThrow();
  });

  it("throws rather than silently minting zero LP for a dust deposit", () => {
    expect(() => computeDepositLpAmount(BigInt(1_000_000), BigInt(1_000_000), BigInt(1_000_000), BigInt(0), BigInt(0))).toThrow();
  });
});

describe("computeWithdrawAmounts", () => {
  it("returns a proportional share of both reserves", () => {
    const { amountA, amountB } = computeWithdrawAmounts(BigInt(1000), BigInt(2000), BigInt(100), BigInt(10));
    expect(amountA).toBe(BigInt(100)); // 10% of reserveA
    expect(amountB).toBe(BigInt(200)); // 10% of reserveB
  });
});

describe("slippage helpers", () => {
  it("applySlippageDown reduces the amount by the given bps", () => {
    expect(applySlippageDown(BigInt(10_000), 100)).toBe(BigInt(9_900)); // 1% slippage
  });
  it("applySlippageUp increases the amount by the given bps", () => {
    expect(applySlippageUp(BigInt(10_000), 100)).toBe(BigInt(10_100));
  });
});
