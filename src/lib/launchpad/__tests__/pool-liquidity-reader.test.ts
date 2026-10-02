import { describe, it, expect, vi } from "vitest";
import { Keypair } from "@solana/web3.js";
import { readPoolLiquidity, computeUserPoolShare } from "../pool-liquidity-reader";

function keypair(seed: number) {
  return Keypair.fromSeed(new Uint8Array(32).fill(seed)).publicKey;
}

describe("readPoolLiquidity", () => {
  it("returns real reserves and LP supply on success", async () => {
    const connection = {
      getTokenAccountBalance: vi
        .fn()
        .mockResolvedValueOnce({ value: { amount: "123456" } })
        .mockResolvedValueOnce({ value: { amount: "789" } }),
      getTokenSupply: vi.fn().mockResolvedValue({ value: { amount: "1000" } }),
    } as any;

    const result = await readPoolLiquidity(connection, {
      baseVault: keypair(1).toBase58(),
      quoteVault: keypair(2).toBase58(),
      lpMint: keypair(3).toBase58(),
    });

    expect(result.status).toBe("OK");
    expect(result.reserveBaseRaw).toBe("123456");
    expect(result.reserveQuoteRaw).toBe("789");
    expect(result.lpSupplyRaw).toBe("1000");
  });

  it("reports UNAVAILABLE (never a fabricated zero) when the RPC call fails", async () => {
    const connection = {
      getTokenAccountBalance: vi.fn().mockRejectedValue(new Error("account not found")),
      getTokenSupply: vi.fn(),
    } as any;

    const result = await readPoolLiquidity(connection, {
      baseVault: keypair(1).toBase58(),
      quoteVault: keypair(2).toBase58(),
      lpMint: keypair(3).toBase58(),
    });

    expect(result.status).toBe("UNAVAILABLE");
    expect(result.reserveBaseRaw).toBeNull();
    expect(result.reason).toMatch(/account not found/);
  });
});

describe("computeUserPoolShare", () => {
  it("computes a proportional share", () => {
    expect(computeUserPoolShare(BigInt(10), BigInt(100)).sharePercent).toBeCloseTo(10, 5);
  });

  it("returns 0% rather than dividing by zero for an empty pool", () => {
    expect(computeUserPoolShare(BigInt(0), BigInt(0)).sharePercent).toBe(0);
  });

  it("does not round a small retail share down to exactly 0%", () => {
    // 1 LP out of 10,000,000 - a tiny but nonzero share.
    const { sharePercent } = computeUserPoolShare(BigInt(1), BigInt(10_000_000));
    expect(sharePercent).toBeGreaterThan(0);
  });
});
