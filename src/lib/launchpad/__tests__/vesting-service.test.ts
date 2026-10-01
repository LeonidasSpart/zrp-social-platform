import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { Keypair } from "@solana/web3.js";

const { getConnection, getPlatformWallet, getOrCreateAssociatedTokenAccount, mockTx } = vi.hoisted(() => {
  const mockTx = {
    vestingRelease: { create: vi.fn() },
    vestingContract: {
      update: vi.fn().mockResolvedValue({ totalReleased: BigInt(0) as unknown as string, totalAmount: BigInt(1000000000) as unknown as string }),
    },
  };
  return {
    getConnection: vi.fn(),
    getPlatformWallet: vi.fn(),
    getOrCreateAssociatedTokenAccount: vi.fn(),
    mockTx,
  };
});
vi.mock("@/lib/solana", () => ({ getConnection, getPlatformWallet }));
vi.mock("@solana/spl-token", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@solana/spl-token")>();
  return { ...actual, getOrCreateAssociatedTokenAccount };
});
vi.mock("@/lib/db", () => ({ prisma: { $transaction: (cb: (tx: typeof mockTx) => unknown) => cb(mockTx) } }));

import { computeClaimableRaw, executeVestingClaim, type VestingContractLike } from "../vesting-service";

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

/*
 * executeVestingClaim: the ambiguous-vs-definite-failure distinction is
 * the actual bug fix under test here. A thrown error during
 * confirmTransaction AFTER sendRawTransaction already returned a
 * signature must never be treated the same as a definite on-chain
 * failure - see the function's own comment and ExecuteClaimResult's
 * `ambiguous` field.
 */
describe("executeVestingClaim", () => {
  beforeEach(() => {
    getConnection.mockReset();
    getPlatformWallet.mockReset();
    getOrCreateAssociatedTokenAccount.mockReset();
    mockTx.vestingRelease.create.mockReset();
    mockTx.vestingContract.update.mockReset().mockResolvedValue({
      totalReleased: new Prisma.Decimal("0"),
      totalAmount: new Prisma.Decimal("1000000000"),
    });

    getPlatformWallet.mockReturnValue(Keypair.generate());
    getOrCreateAssociatedTokenAccount.mockResolvedValue({ address: Keypair.generate().publicKey });
  });

  function baseParams() {
    return {
      contractId: "contract1",
      mintAddress: Keypair.generate().publicKey.toBase58(),
      beneficiaryWalletAddress: Keypair.generate().publicKey.toBase58(),
      claimableRaw: BigInt(1000),
    };
  }

  it("succeeds and records the release when confirmation returns no error", async () => {
    getConnection.mockReturnValue({
      getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100 }),
      sendRawTransaction: vi.fn().mockResolvedValue("sig-success"),
      confirmTransaction: vi.fn().mockResolvedValue({ value: { err: null } }),
    });

    const result = await executeVestingClaim(baseParams());
    expect(result).toEqual({ success: true, signature: "sig-success" });
    expect(mockTx.vestingRelease.create).toHaveBeenCalledTimes(1);
  });

  it("is a definite (non-ambiguous) failure when confirmation returns an on-chain error - nothing moved, safe to retry", async () => {
    getConnection.mockReturnValue({
      getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100 }),
      sendRawTransaction: vi.fn().mockResolvedValue("sig-failed"),
      confirmTransaction: vi.fn().mockResolvedValue({ value: { err: "InstructionError" } }),
    });

    const result = await executeVestingClaim(baseParams());
    expect(result.success).toBe(false);
    expect(result.ambiguous).toBe(false);
    expect(mockTx.vestingRelease.create).not.toHaveBeenCalled();
  });

  it("is ambiguous when confirmTransaction throws AFTER a signature was already obtained - the claim may have actually succeeded", async () => {
    getConnection.mockReturnValue({
      getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100 }),
      sendRawTransaction: vi.fn().mockResolvedValue("sig-ambiguous"),
      confirmTransaction: vi.fn().mockRejectedValue(new Error("RPC timeout")),
    });

    const result = await executeVestingClaim(baseParams());
    expect(result.success).toBe(false);
    expect(result.ambiguous).toBe(true);
    expect(result.signature).toBe("sig-ambiguous");
    // Never records a release for an unconfirmed outcome - the caller
    // (the claim route) is responsible for marking the contract
    // disputed instead, never for silently proceeding as if nothing
    // happened.
    expect(mockTx.vestingRelease.create).not.toHaveBeenCalled();
  });

  it("is NOT ambiguous when sendRawTransaction itself throws BEFORE any signature exists - genuinely never broadcast", async () => {
    getConnection.mockReturnValue({
      getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100 }),
      sendRawTransaction: vi.fn().mockRejectedValue(new Error("network error before broadcast")),
      confirmTransaction: vi.fn(),
    });

    const result = await executeVestingClaim(baseParams());
    expect(result.success).toBe(false);
    expect(result.ambiguous).toBe(false);
    expect(result.signature).toBeUndefined();
  });
});
