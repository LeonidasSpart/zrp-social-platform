import { describe, it, expect, vi, beforeEach } from "vitest";

const { scanToken, getTokenPriceUsdc, findUnique } = vi.hoisted(() => ({
  scanToken: vi.fn(),
  getTokenPriceUsdc: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("../token-scanner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../token-scanner")>();
  return { ...actual, scanToken };
});
vi.mock("../price-service", () => ({ getTokenPriceUsdc }));
vi.mock("@/lib/db", () => ({ prisma: { launchedToken: { findUnique } } }));

import { getTokenAnalytics, getCachedTokenAnalytics, _resetTokenAnalyticsCacheForTests } from "../token-analytics";
import { TokenScanError } from "../token-scanner";

const MINT = "TokEn1111111111111111111111111111111111111";

const baseScan = {
  mintAddress: MINT,
  tokenProgram: "TOKEN_PROGRAM" as const,
  supplyRaw: "1000000000000", // 1,000,000 tokens at 6 decimals
  decimals: 6,
  mintAuthority: null,
  freezeAuthority: null,
  metadata: { name: "Test Token", symbol: "TST", uri: "https://example.com", updateAuthority: "", isMutable: false },
  topHolders: [{ address: "HolderAddr1111111111111111111111111111111", amountRaw: "500000000000", percent: 50 }],
  topHolderConcentrationPercent: 50,
  riskFlags: ["high_holder_concentration"],
};

describe("getTokenAnalytics", () => {
  beforeEach(() => {
    scanToken.mockReset();
    getTokenPriceUsdc.mockReset();
    findUnique.mockReset();
    _resetTokenAnalyticsCacheForTests();
  });

  it("computes FDV from a real price and real supply, and never invents a market cap", async () => {
    scanToken.mockResolvedValue(baseScan);
    getTokenPriceUsdc.mockResolvedValue({
      status: "OK",
      priceUsdc: 2,
      source: "JUPITER",
      quoteCurrency: "USDC",
      priceImpactPercent: 0.5,
      reason: null,
      timestamp: new Date().toISOString(),
    });
    findUnique.mockResolvedValue(null);

    const result = await getTokenAnalytics(MINT);
    expect(result.market.priceUsdc).toBe(2);
    expect(result.market.fdvUsdc).toBeCloseTo(2_000_000, 5); // 1,000,000 tokens * $2
    expect(result.market.marketCapUsdc).toBeNull();
    expect(result.market.marketCapUnavailableReason).toBe("CIRCULATING_SUPPLY_UNKNOWN");
  });

  it("never fabricates a price or FDV when price discovery is unavailable", async () => {
    scanToken.mockResolvedValue(baseScan);
    getTokenPriceUsdc.mockResolvedValue({
      status: "UNAVAILABLE",
      priceUsdc: null,
      source: null,
      quoteCurrency: "USDC",
      priceImpactPercent: null,
      reason: "NO_RELIABLE_MARKET",
      timestamp: new Date().toISOString(),
    });
    findUnique.mockResolvedValue(null);

    const result = await getTokenAnalytics(MINT);
    expect(result.market.priceUsdc).toBeNull();
    expect(result.market.fdvUsdc).toBeNull();
    expect(result.market.priceUnavailableReason).toBe("NO_RELIABLE_MARKET");
  });

  it("marks volume and liquidity as honestly unimplemented, never a fake zero", async () => {
    scanToken.mockResolvedValue(baseScan);
    getTokenPriceUsdc.mockResolvedValue({ status: "UNAVAILABLE", priceUsdc: null, source: null, quoteCurrency: "USDC", priceImpactPercent: null, reason: "NO_RELIABLE_MARKET", timestamp: "" });
    findUnique.mockResolvedValue(null);

    const result = await getTokenAnalytics(MINT);
    expect(result.volume).toEqual({ status: "UNAVAILABLE", reason: "NOT_IMPLEMENTED" });
    expect(result.liquidity).toEqual({ status: "UNAVAILABLE", reason: "NOT_IMPLEMENTED", totalLiquidityUsd: null, pools: [] });
    expect(result.pools).toEqual([]);
  });

  it("merges ZRP-launched-token off-chain metadata (socials, creator) when a LaunchedToken row exists", async () => {
    scanToken.mockResolvedValue(baseScan);
    getTokenPriceUsdc.mockResolvedValue({ status: "UNAVAILABLE", priceUsdc: null, source: null, quoteCurrency: "USDC", priceImpactPercent: null, reason: "NO_RELIABLE_MARKET", timestamp: "" });
    findUnique.mockResolvedValue({
      description: "A real ZRP-launched token",
      website: "https://zrp.example",
      twitter: "zrp",
      telegram: null,
      discord: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      creator: { id: "u1", username: "creator1", name: "Creator One", avatarUrl: null },
    });

    const result = await getTokenAnalytics(MINT);
    expect(result.token.launchedOnZrp).toBe(true);
    expect(result.token.website).toBe("https://zrp.example");
    expect(result.token.creator?.username).toBe("creator1");
    expect(result.token.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("reports launchedOnZrp: false for a token ZRP never minted, without failing", async () => {
    scanToken.mockResolvedValue(baseScan);
    getTokenPriceUsdc.mockResolvedValue({ status: "UNAVAILABLE", priceUsdc: null, source: null, quoteCurrency: "USDC", priceImpactPercent: null, reason: "NO_RELIABLE_MARKET", timestamp: "" });
    findUnique.mockResolvedValue(null);

    const result = await getTokenAnalytics(MINT);
    expect(result.token.launchedOnZrp).toBe(false);
    expect(result.token.creator).toBeNull();
    expect(result.token.createdAt).toBeNull();
  });

  it("labels top holders honestly as accounts, not deduplicated owners", async () => {
    scanToken.mockResolvedValue(baseScan);
    getTokenPriceUsdc.mockResolvedValue({ status: "UNAVAILABLE", priceUsdc: null, source: null, quoteCurrency: "USDC", priceImpactPercent: null, reason: "NO_RELIABLE_MARKET", timestamp: "" });
    findUnique.mockResolvedValue(null);

    const result = await getTokenAnalytics(MINT);
    expect(result.holders.status).toBe("PARTIAL");
    expect(result.holders.topHolderAccounts).toEqual(baseScan.topHolders);
    expect(result.holders.note).toMatch(/not deduplicated owner wallets/);
  });

  it("propagates TokenScanError untouched so the route can classify it", async () => {
    scanToken.mockRejectedValue(new TokenScanError("TOKEN_NOT_FOUND", "no account"));
    await expect(getTokenAnalytics(MINT)).rejects.toBeInstanceOf(TokenScanError);
  });
});

describe("getCachedTokenAnalytics", () => {
  beforeEach(() => {
    scanToken.mockReset();
    getTokenPriceUsdc.mockReset();
    findUnique.mockReset();
    _resetTokenAnalyticsCacheForTests();
  });

  it("serves a cached result without re-calling scanToken within the TTL", async () => {
    scanToken.mockResolvedValue(baseScan);
    getTokenPriceUsdc.mockResolvedValue({ status: "UNAVAILABLE", priceUsdc: null, source: null, quoteCurrency: "USDC", priceImpactPercent: null, reason: "NO_RELIABLE_MARKET", timestamp: "" });
    findUnique.mockResolvedValue(null);

    await getCachedTokenAnalytics(MINT);
    await getCachedTokenAnalytics(MINT);
    expect(scanToken).toHaveBeenCalledTimes(1);
  });

  it("never caches a failure - the next call retries immediately", async () => {
    scanToken.mockRejectedValueOnce(new TokenScanError("RPC_UNAVAILABLE", "down"));
    scanToken.mockResolvedValueOnce(baseScan);
    getTokenPriceUsdc.mockResolvedValue({ status: "UNAVAILABLE", priceUsdc: null, source: null, quoteCurrency: "USDC", priceImpactPercent: null, reason: "NO_RELIABLE_MARKET", timestamp: "" });
    findUnique.mockResolvedValue(null);

    await expect(getCachedTokenAnalytics(MINT)).rejects.toBeInstanceOf(TokenScanError);
    const result = await getCachedTokenAnalytics(MINT);
    expect(result.token.mintAddress).toBe(MINT);
    expect(scanToken).toHaveBeenCalledTimes(2);
  });
});
