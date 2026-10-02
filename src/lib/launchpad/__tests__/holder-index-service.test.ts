import { describe, it, expect, vi } from "vitest";
import { Keypair } from "@solana/web3.js";
import { AccountLayout, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { indexTopHolders } from "../holder-index-service";

function keypair(seed: number) {
  return Keypair.fromSeed(new Uint8Array(32).fill(seed)).publicKey;
}

function encodeTokenAccount(owner: ReturnType<typeof keypair>, mint: ReturnType<typeof keypair>) {
  const buf = Buffer.alloc(AccountLayout.span);
  AccountLayout.encode(
    { mint, owner, amount: BigInt(0), delegateOption: 0, delegate: keypair(99), state: 1, isNativeOption: 0, isNative: BigInt(0), delegatedAmount: BigInt(0), closeAuthorityOption: 0, closeAuthority: keypair(99) } as any,
    buf
  );
  return buf;
}

describe("indexTopHolders", () => {
  it("dedups two token accounts owned by the same wallet into a single holder", async () => {
    const mint = keypair(1);
    const ownerA = keypair(2); // holds two accounts
    const ownerB = keypair(3); // holds one account

    const accounts = [keypair(10), keypair(11), keypair(12)];
    const owners = [ownerA, ownerA, ownerB];
    const amounts = ["600", "400", "500"]; // ownerA total 1000, ownerB 500

    const connection = {
      getTokenLargestAccounts: vi.fn().mockResolvedValue({
        value: accounts.map((address, i) => ({ address, amount: amounts[i] })),
      }),
      getMultipleAccountsInfo: vi.fn().mockResolvedValue(
        owners.map((owner) => ({ owner: TOKEN_PROGRAM_ID, data: encodeTokenAccount(owner, mint) }))
      ),
    } as any;

    const result = await indexTopHolders(connection, mint.toBase58());
    expect(result.status).toBe("OK");
    expect(result.topOwners).toHaveLength(2);
    expect(result.topOwners[0].owner).toBe(ownerA.toBase58());
    expect(result.topOwners[0].amountRaw).toBe("1000");
    expect(result.topOwners[1].amountRaw).toBe("500");
    // 1000 of 1500 total = 66.67%, 500 of 1500 = 33.33%
    expect(result.top10ConcentrationPercent).toBeCloseTo(100, 2);
  });

  it("excludes explicitly-passed owners (e.g. a pool authority) from the holder list", async () => {
    const mint = keypair(1);
    const excludedOwner = keypair(5);
    const realHolder = keypair(6);

    const connection = {
      getTokenLargestAccounts: vi.fn().mockResolvedValue({
        value: [
          { address: keypair(20), amount: "900" },
          { address: keypair(21), amount: "100" },
        ],
      }),
      getMultipleAccountsInfo: vi.fn().mockResolvedValue([
        { owner: TOKEN_PROGRAM_ID, data: encodeTokenAccount(excludedOwner, mint) },
        { owner: TOKEN_PROGRAM_ID, data: encodeTokenAccount(realHolder, mint) },
      ]),
    } as any;

    const result = await indexTopHolders(connection, mint.toBase58(), { excludeOwners: [excludedOwner.toBase58()] });
    expect(result.topOwners).toHaveLength(1);
    expect(result.topOwners[0].owner).toBe(realHolder.toBase58());
    expect(result.top10ConcentrationPercent).toBeCloseTo(100, 5);
  });

  it("never claims a full holder count - that is always disclosed as NOT_AVAILABLE", async () => {
    const mint = keypair(1);
    const connection = {
      getTokenLargestAccounts: vi.fn().mockResolvedValue({ value: [] }),
      getMultipleAccountsInfo: vi.fn().mockResolvedValue([]),
    } as any;
    const result = await indexTopHolders(connection, mint.toBase58());
    expect(result.totalHolderCount.status).toBe("NOT_AVAILABLE");
  });

  it("reports UNAVAILABLE (never a fabricated empty result) when the RPC call itself fails", async () => {
    const mint = keypair(1);
    const connection = {
      getTokenLargestAccounts: vi.fn().mockRejectedValue(new Error("RPC down")),
    } as any;
    const result = await indexTopHolders(connection, mint.toBase58());
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.reason).toMatch(/RPC down/);
  });
});
