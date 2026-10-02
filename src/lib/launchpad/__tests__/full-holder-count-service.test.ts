import { describe, it, expect, vi } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { indexFullHolderCount } from "../full-holder-count-service";

function keypair(seed: number): PublicKey {
  return Keypair.fromSeed(new Uint8Array(32).fill(seed)).publicKey;
}

function tokenAccountSlice(owner: PublicKey, amount: bigint): Buffer {
  const buf = Buffer.alloc(40);
  owner.toBuffer().copy(buf, 0);
  buf.writeBigUInt64LE(amount, 32);
  return buf;
}

describe("indexFullHolderCount", () => {
  it("counts distinct owners, not distinct accounts (two accounts, one owner)", async () => {
    const owner = keypair(1);
    const connection = {
      getProgramAccounts: vi.fn().mockResolvedValue([
        { account: { data: tokenAccountSlice(owner, BigInt(100)) } },
        { account: { data: tokenAccountSlice(owner, BigInt(50)) } }, // same owner, second account
      ]),
    } as any;

    const result = await indexFullHolderCount(connection, keypair(99).toBase58());
    expect(result.status).toBe("OK");
    expect(result.holderCount).toBe(1);
  });

  it("counts two distinct owners as two holders", async () => {
    const connection = {
      getProgramAccounts: vi.fn().mockResolvedValue([
        { account: { data: tokenAccountSlice(keypair(1), BigInt(100)) } },
        { account: { data: tokenAccountSlice(keypair(2), BigInt(100)) } },
      ]),
    } as any;

    const result = await indexFullHolderCount(connection, keypair(99).toBase58());
    expect(result.holderCount).toBe(2);
  });

  it("excludes a zero-balance account from the holder count", async () => {
    const connection = {
      getProgramAccounts: vi.fn().mockResolvedValue([
        { account: { data: tokenAccountSlice(keypair(1), BigInt(0)) } },
        { account: { data: tokenAccountSlice(keypair(2), BigInt(1)) } },
      ]),
    } as any;

    const result = await indexFullHolderCount(connection, keypair(99).toBase58());
    expect(result.holderCount).toBe(1);
  });

  it("excludes explicitly-passed owner addresses (burn/pool/curve accounts)", async () => {
    const burnOwner = keypair(7);
    const connection = {
      getProgramAccounts: vi.fn().mockResolvedValue([
        { account: { data: tokenAccountSlice(burnOwner, BigInt(1000)) } },
        { account: { data: tokenAccountSlice(keypair(8), BigInt(1)) } },
      ]),
    } as any;

    const result = await indexFullHolderCount(connection, keypair(99).toBase58(), {
      excludeOwners: [burnOwner.toBase58()],
    });
    expect(result.holderCount).toBe(1);
  });

  it("reports UNAVAILABLE (never a fabricated count) when the RPC call fails", async () => {
    const connection = { getProgramAccounts: vi.fn().mockRejectedValue(new Error("rpc timeout")) } as any;
    const result = await indexFullHolderCount(connection, keypair(99).toBase58());
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.holderCount).toBeNull();
    expect(result.reason).toMatch(/rpc timeout/);
  });

  it("reports UNAVAILABLE rather than truncating when there are too many accounts to safely enumerate", async () => {
    // A fake 32-byte "owner" per account is enough here - no real keypair
    // derivation needed, and generating 50k+ real keypairs would make this
    // one test dominate the whole suite's runtime.
    const tooMany = Array.from({ length: 50_001 }, (_, i) => {
      const owner = Buffer.alloc(32);
      owner.writeUInt32LE(i, 0);
      const data = Buffer.alloc(40);
      owner.copy(data, 0);
      data.writeBigUInt64LE(BigInt(1), 32);
      return { account: { data } };
    });
    const connection = { getProgramAccounts: vi.fn().mockResolvedValue(tooMany) } as any;
    const result = await indexFullHolderCount(connection, keypair(99).toBase58());
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.holderCount).toBeNull();
  });

  it("returns zero holders (a real, meaningful value) for a mint with no open accounts", async () => {
    const connection = { getProgramAccounts: vi.fn().mockResolvedValue([]) } as any;
    const result = await indexFullHolderCount(connection, keypair(99).toBase58());
    expect(result.status).toBe("OK");
    expect(result.holderCount).toBe(0);
  });
});
