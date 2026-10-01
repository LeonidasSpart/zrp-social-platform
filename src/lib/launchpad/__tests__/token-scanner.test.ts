import { describe, it, expect, vi, beforeEach } from "vitest";
import { Keypair } from "@solana/web3.js";

/*
 * scanToken() talks to three external boundaries (getMint,
 * Metadata.fromAccountAddress, connection.getTokenLargestAccounts) -
 * all mocked here so this is a pure test of the risk-flag/concentration
 * logic, not a live RPC test. The flags themselves are the whole point
 * of a scanner: this locks in exactly which on-chain states are
 * considered risky.
 */
const { getMint, fromAccountAddress, getConnection } = vi.hoisted(() => ({
  getMint: vi.fn(),
  fromAccountAddress: vi.fn(),
  getConnection: vi.fn(),
}));

vi.mock("@solana/spl-token", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@solana/spl-token")>();
  return { ...actual, getMint };
});
vi.mock("@metaplex-foundation/mpl-token-metadata", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@metaplex-foundation/mpl-token-metadata")>();
  return { ...actual, Metadata: { ...actual.Metadata, fromAccountAddress } };
});
vi.mock("@/lib/solana", () => ({ getConnection }));

import { scanToken } from "../token-scanner";

const mint = Keypair.generate().publicKey;
const holder1 = Keypair.generate().publicKey.toBase58();
const holder2 = Keypair.generate().publicKey.toBase58();
const updateAuthority = Keypair.generate().publicKey;

function mockConnection(largestAccounts: Array<{ address: string; amount: string }>) {
  getConnection.mockReturnValue({
    getTokenLargestAccounts: vi.fn().mockResolvedValue({
      value: largestAccounts.map((a) => ({ address: { toBase58: () => a.address }, amount: a.amount })),
    }),
  });
}

describe("scanToken", () => {
  beforeEach(() => {
    getMint.mockReset();
    fromAccountAddress.mockReset();
    getConnection.mockReset();
  });

  it("flags an active mint authority and freeze authority", async () => {
    const authority = Keypair.generate().publicKey;
    getMint.mockResolvedValue({ supply: BigInt("1000000"), decimals: 6, mintAuthority: authority, freezeAuthority: authority });
    fromAccountAddress.mockRejectedValue(new Error("account not found"));
    mockConnection([{ address: holder1, amount: "100000" }]);

    const result = await scanToken(mint.toBase58());
    expect(result.riskFlags).toContain("mint_authority_active");
    expect(result.riskFlags).toContain("freeze_authority_active");
    expect(result.riskFlags).toContain("metadata_missing");
    expect(result.metadata).toBeNull();
  });

  it("does not flag revoked (null) authorities", async () => {
    getMint.mockResolvedValue({ supply: BigInt("1000000"), decimals: 9, mintAuthority: null, freezeAuthority: null });
    fromAccountAddress.mockResolvedValue({
      data: { name: "Safe Token\0\0", symbol: "SAFE\0", uri: "https://example.com/meta.json\0" },
      updateAuthority: { toBase58: () => "1nc1nerator11111111111111111111111111111111" },
      isMutable: false,
    });
    mockConnection([{ address: holder1, amount: "100000" }]);

    const result = await scanToken(mint.toBase58());
    expect(result.riskFlags).not.toContain("mint_authority_active");
    expect(result.riskFlags).not.toContain("freeze_authority_active");
    expect(result.riskFlags).not.toContain("metadata_mutable");
    expect(result.metadata?.name).toBe("Safe Token");
  });

  it("flags mutable metadata when isMutable is true", async () => {
    getMint.mockResolvedValue({ supply: BigInt("1000000"), decimals: 9, mintAuthority: null, freezeAuthority: null });
    fromAccountAddress.mockResolvedValue({
      data: { name: "Mutable Token", symbol: "MUT", uri: "https://example.com/meta.json" },
      updateAuthority,
      isMutable: true,
    });
    mockConnection([{ address: holder1, amount: "100000" }]);

    const result = await scanToken(mint.toBase58());
    expect(result.riskFlags).toContain("metadata_mutable");
  });

  it("flags high holder concentration at or above 50% held by the top holder", async () => {
    getMint.mockResolvedValue({ supply: BigInt("1000000"), decimals: 9, mintAuthority: null, freezeAuthority: null });
    fromAccountAddress.mockRejectedValue(new Error("account not found"));
    mockConnection([
      { address: holder1, amount: "500000" }, // exactly 50%
      { address: holder2, amount: "200000" },
    ]);

    const result = await scanToken(mint.toBase58());
    expect(result.topHolderConcentrationPercent).toBeCloseTo(50, 5);
    expect(result.riskFlags).toContain("high_holder_concentration");
  });

  it("does not flag concentration when the top holder is below 50%", async () => {
    getMint.mockResolvedValue({ supply: BigInt("1000000"), decimals: 9, mintAuthority: null, freezeAuthority: null });
    fromAccountAddress.mockRejectedValue(new Error("account not found"));
    mockConnection([
      { address: holder1, amount: "300000" },
      { address: holder2, amount: "300000" },
    ]);

    const result = await scanToken(mint.toBase58());
    expect(result.topHolderConcentrationPercent).toBeCloseTo(30, 5);
    expect(result.riskFlags).not.toContain("high_holder_concentration");
  });
});
