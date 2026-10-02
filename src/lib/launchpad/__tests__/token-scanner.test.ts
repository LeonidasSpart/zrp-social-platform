import { describe, it, expect, vi, beforeEach } from "vitest";
import { Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TokenInvalidAccountOwnerError } from "@solana/spl-token";

/*
 * scanToken() talks to several external boundaries (getAccountInfo,
 * getMint, getTokenMetadata, Metadata.fromAccountAddress,
 * connection.getTokenLargestAccounts) - all mocked here so this is a
 * pure test of the classification/risk-flag/concentration logic, not a
 * live RPC test.
 *
 * The getAccountInfo/programId-resolution tests are the regression
 * coverage for the real production incident this file fixes: scanToken()
 * used to call getMint() with no programId (defaulting to classic SPL
 * Token), so any Token-2022 mint threw TokenInvalidAccountOwnerError and
 * the route collapsed that into a generic "may not exist or RPC
 * unavailable" message - which was wrong on both counts (the token
 * exists, the RPC is fine).
 */
const { getMint, getTokenMetadata, fromAccountAddress, getConnection } = vi.hoisted(() => ({
  getMint: vi.fn(),
  getTokenMetadata: vi.fn(),
  fromAccountAddress: vi.fn(),
  getConnection: vi.fn(),
}));

vi.mock("@solana/spl-token", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@solana/spl-token")>();
  return { ...actual, getMint, getTokenMetadata };
});
vi.mock("@metaplex-foundation/mpl-token-metadata", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@metaplex-foundation/mpl-token-metadata")>();
  return { ...actual, Metadata: { ...actual.Metadata, fromAccountAddress } };
});
vi.mock("@/lib/solana", () => ({ getConnection }));

import { scanToken, TokenScanError } from "../token-scanner";

const mint = Keypair.generate().publicKey;
const holder1 = Keypair.generate().publicKey.toBase58();
const holder2 = Keypair.generate().publicKey.toBase58();
const updateAuthority = Keypair.generate().publicKey;

function mockConnection(
  largestAccounts: Array<{ address: string; amount: string }>,
  options?: { owner?: import("@solana/web3.js").PublicKey | null; getAccountInfoError?: unknown }
) {
  const owner = options?.owner === undefined ? TOKEN_PROGRAM_ID : options.owner;
  getConnection.mockReturnValue({
    getAccountInfo: vi.fn().mockImplementation(() => {
      if (options?.getAccountInfoError) return Promise.reject(options.getAccountInfoError);
      if (owner === null) return Promise.resolve(null);
      return Promise.resolve({ owner });
    }),
    getTokenLargestAccounts: vi.fn().mockResolvedValue({
      value: largestAccounts.map((a) => ({ address: { toBase58: () => a.address }, amount: a.amount })),
    }),
  });
}

describe("scanToken", () => {
  beforeEach(() => {
    getMint.mockReset();
    getTokenMetadata.mockReset();
    fromAccountAddress.mockReset();
    getConnection.mockReset();
  });

  it("rejects a malformed mint address as INVALID_MINT without touching the RPC", async () => {
    await expect(scanToken("not-a-valid-base58-pubkey")).rejects.toMatchObject({ code: "INVALID_MINT" });
    expect(getConnection).not.toHaveBeenCalled();
  });

  it("classifies a nonexistent account as TOKEN_NOT_FOUND", async () => {
    mockConnection([], { owner: null });
    await expect(scanToken(mint.toBase58())).rejects.toMatchObject({ code: "TOKEN_NOT_FOUND" });
  });

  it("classifies an account owned by a non-token program as UNSUPPORTED_TOKEN_PROGRAM", async () => {
    mockConnection([], { owner: Keypair.generate().publicKey });
    await expect(scanToken(mint.toBase58())).rejects.toMatchObject({ code: "UNSUPPORTED_TOKEN_PROGRAM" });
    expect(getMint).not.toHaveBeenCalled();
  });

  it("classifies a timed-out getAccountInfo call as RPC_TIMEOUT", async () => {
    const timeoutErr = new Error("Request timed out");
    timeoutErr.name = "AbortError";
    mockConnection([], { getAccountInfoError: timeoutErr });
    await expect(scanToken(mint.toBase58())).rejects.toMatchObject({ code: "RPC_TIMEOUT" });
  });

  it("classifies a rate-limited/unreachable getAccountInfo call as RPC_UNAVAILABLE", async () => {
    mockConnection([], { getAccountInfoError: new Error("429 Too Many Requests") });
    await expect(scanToken(mint.toBase58())).rejects.toMatchObject({ code: "RPC_UNAVAILABLE" });
  });

  it("classifies TokenInvalidAccountOwnerError from getMint itself as UNSUPPORTED_TOKEN_PROGRAM", async () => {
    mockConnection([{ address: holder1, amount: "100000" }]);
    getMint.mockRejectedValue(new TokenInvalidAccountOwnerError());
    await expect(scanToken(mint.toBase58())).rejects.toMatchObject({ code: "UNSUPPORTED_TOKEN_PROGRAM" });
  });

  it("scans a classic SPL Token mint via TOKEN_PROGRAM_ID (unchanged behavior)", async () => {
    getMint.mockResolvedValue({ supply: BigInt("1000000"), decimals: 9, mintAuthority: null, freezeAuthority: null });
    fromAccountAddress.mockResolvedValue({
      data: { name: "Safe Token\0\0", symbol: "SAFE\0", uri: "https://example.com/meta.json\0" },
      updateAuthority: { toBase58: () => "1nc1nerator11111111111111111111111111111111" },
      isMutable: false,
    });
    mockConnection([{ address: holder1, amount: "100000" }]);

    const result = await scanToken(mint.toBase58());
    expect(result.tokenProgram).toBe("TOKEN_PROGRAM");
    expect(getMint).toHaveBeenCalledWith(expect.anything(), expect.anything(), "confirmed", TOKEN_PROGRAM_ID);
    expect(getTokenMetadata).not.toHaveBeenCalled();
    expect(result.metadata?.name).toBe("Safe Token");
  });

  it("scans a Token-2022 mint via TOKEN_2022_PROGRAM_ID instead of crashing (the production regression)", async () => {
    getMint.mockResolvedValue({ supply: BigInt("5000000"), decimals: 6, mintAuthority: null, freezeAuthority: null });
    getTokenMetadata.mockResolvedValue({
      name: "2022 Token",
      symbol: "T22",
      uri: "https://example.com/t22.json",
      updateAuthority: undefined,
      additionalMetadata: [],
    });
    mockConnection([{ address: holder1, amount: "100000" }], { owner: TOKEN_2022_PROGRAM_ID });

    const result = await scanToken(mint.toBase58());
    expect(result.tokenProgram).toBe("TOKEN_2022_PROGRAM");
    expect(getMint).toHaveBeenCalledWith(expect.anything(), expect.anything(), "confirmed", TOKEN_2022_PROGRAM_ID);
    expect(fromAccountAddress).not.toHaveBeenCalled();
    expect(result.metadata).toEqual({ name: "2022 Token", symbol: "T22", uri: "https://example.com/t22.json", updateAuthority: "", isMutable: false });
    expect(result.riskFlags).not.toContain("metadata_missing");
  });

  it("falls back to Metaplex metadata for a Token-2022 mint with no native metadata extension", async () => {
    getMint.mockResolvedValue({ supply: BigInt("5000000"), decimals: 6, mintAuthority: null, freezeAuthority: null });
    getTokenMetadata.mockResolvedValue(null);
    fromAccountAddress.mockResolvedValue({
      data: { name: "Legacy-style 2022", symbol: "LEG", uri: "https://example.com/leg.json" },
      updateAuthority,
      isMutable: true,
    });
    mockConnection([{ address: holder1, amount: "100000" }], { owner: TOKEN_2022_PROGRAM_ID });

    const result = await scanToken(mint.toBase58());
    expect(result.metadata?.name).toBe("Legacy-style 2022");
    expect(result.riskFlags).toContain("metadata_mutable");
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

  it("flags high holder concentration when a single holder is at or above 50%", async () => {
    getMint.mockResolvedValue({ supply: BigInt("1000000"), decimals: 9, mintAuthority: null, freezeAuthority: null });
    fromAccountAddress.mockRejectedValue(new Error("account not found"));
    mockConnection([
      { address: holder1, amount: "500000" }, // exactly 50%
      { address: holder2, amount: "200000" },
    ]);

    const result = await scanToken(mint.toBase58());
    // Sums the fetched top holders (50% + 20%), not just the largest.
    expect(result.topHolderConcentrationPercent).toBeCloseTo(70, 5);
    expect(result.riskFlags).toContain("high_holder_concentration");
  });

  it("flags high holder concentration when several holders combined reach 50%, even though no single one does", async () => {
    // Regression test: a token split across several large wallets is
    // just as concentrated as one whale holding the same share, and
    // must trip the same flag - this is exactly the case the single-
    // largest-holder-only calculation used to miss.
    getMint.mockResolvedValue({ supply: BigInt("1000000"), decimals: 9, mintAuthority: null, freezeAuthority: null });
    fromAccountAddress.mockRejectedValue(new Error("account not found"));
    mockConnection([
      { address: holder1, amount: "300000" },
      { address: holder2, amount: "300000" },
    ]);

    const result = await scanToken(mint.toBase58());
    expect(result.topHolderConcentrationPercent).toBeCloseTo(60, 5);
    expect(result.riskFlags).toContain("high_holder_concentration");
  });

  it("does not flag concentration when combined top holders are below 50%", async () => {
    getMint.mockResolvedValue({ supply: BigInt("1000000"), decimals: 9, mintAuthority: null, freezeAuthority: null });
    fromAccountAddress.mockRejectedValue(new Error("account not found"));
    mockConnection([
      { address: holder1, amount: "100000" },
      { address: holder2, amount: "100000" },
    ]);

    const result = await scanToken(mint.toBase58());
    expect(result.topHolderConcentrationPercent).toBeCloseTo(20, 5);
    expect(result.riskFlags).not.toContain("high_holder_concentration");
  });

  it("classifies a getTokenLargestAccounts RPC failure instead of throwing an unclassified error", async () => {
    getMint.mockResolvedValue({ supply: BigInt("1000000"), decimals: 9, mintAuthority: null, freezeAuthority: null });
    fromAccountAddress.mockRejectedValue(new Error("account not found"));
    getConnection.mockReturnValue({
      getAccountInfo: vi.fn().mockResolvedValue({ owner: TOKEN_PROGRAM_ID }),
      getTokenLargestAccounts: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    });

    await expect(scanToken(mint.toBase58())).rejects.toBeInstanceOf(TokenScanError);
    await expect(scanToken(mint.toBase58())).rejects.toMatchObject({ code: "RPC_UNAVAILABLE" });
  });
});
