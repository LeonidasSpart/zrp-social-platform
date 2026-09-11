import { describe, it, expect, beforeEach, vi } from "vitest";

const { safeFetch } = vi.hoisted(() => ({ safeFetch: vi.fn() }));
vi.mock("@/lib/ssrf-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ssrf-guard")>();
  return { ...actual, safeFetch };
});

import {
  fetchCryptoMarketData,
  getCachedCryptoMarketData,
  _resetCryptoMarketDataCacheForTests,
} from "../crypto-market-data";

function jsonResponse(body: unknown, statusCode = 200) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: Buffer.from(JSON.stringify(body), "utf-8"),
  };
}

const REAL_ROW = {
  id: "bitcoin",
  symbol: "btc",
  name: "Bitcoin",
  image: "https://assets.example/bitcoin.png",
  current_price: 62345.12,
  market_cap: 1_230_000_000_000,
  market_cap_rank: 1,
  total_volume: 34_000_000_000,
  price_change_percentage_24h: 2.35,
};

/*
 * Absolute rule for this feature, twice over - a platform-wide design
 * rule ("never ship fake data") and an explicit requirement: a provider
 * failure must come back as an honest failure, never a fabricated or
 * stale snapshot dressed up as current.
 */
describe("fetchCryptoMarketData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetCryptoMarketDataCacheForTests();
  });

  it("returns real rows from a real provider response", async () => {
    safeFetch.mockResolvedValue(jsonResponse([REAL_ROW]));

    const result = await fetchCryptoMarketData();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({
      id: "bitcoin",
      symbol: "BTC",
      name: "Bitcoin",
      image: "https://assets.example/bitcoin.png",
      priceUsd: 62345.12,
      marketCapUsd: 1_230_000_000_000,
      rank: 1,
      volume24hUsd: 34_000_000_000,
      priceChangePercent24h: 2.35,
    });
  });

  it("never fabricates data when the provider is unreachable", async () => {
    safeFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await fetchCryptoMarketData();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toContain("ECONNREFUSED");
  });

  it("never fabricates data on a non-2xx response", async () => {
    safeFetch.mockResolvedValue(jsonResponse({ error: "rate limited" }, 429));

    const result = await fetchCryptoMarketData();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toContain("429");
  });

  it("never fabricates data when the response is not valid JSON", async () => {
    safeFetch.mockResolvedValue({
      statusCode: 200,
      headers: {},
      body: Buffer.from("<html>not json</html>", "utf-8"),
    });

    const result = await fetchCryptoMarketData();
    expect(result.ok).toBe(false);
  });

  it("never fabricates data when the response is not a list", async () => {
    safeFetch.mockResolvedValue(jsonResponse({ not: "a list" }));

    const result = await fetchCryptoMarketData();
    expect(result.ok).toBe(false);
  });

  it("drops a row missing a field this feature needs, rather than guessing one", async () => {
    const incomplete = { ...REAL_ROW, current_price: null };
    safeFetch.mockResolvedValue(jsonResponse([REAL_ROW, incomplete]));

    const result = await fetchCryptoMarketData();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    // The good row survives; the incomplete one is dropped, not patched
    // with a guessed price.
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].id).toBe("bitcoin");
  });

  it("fails rather than serving an empty snapshot as if it were real", async () => {
    safeFetch.mockResolvedValue(jsonResponse([]));

    const result = await fetchCryptoMarketData();
    expect(result.ok).toBe(false);
  });

  it("rejects a non-https image URL rather than passing it through", async () => {
    safeFetch.mockResolvedValue(
      jsonResponse([{ ...REAL_ROW, image: "javascript:alert(1)" }])
    );

    const result = await fetchCryptoMarketData();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.rows[0].image).toBeNull();
  });
});

describe("getCachedCryptoMarketData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetCryptoMarketDataCacheForTests();
  });

  it("does not call the provider again within the cache window", async () => {
    safeFetch.mockResolvedValue(jsonResponse([REAL_ROW]));

    await getCachedCryptoMarketData();
    await getCachedCryptoMarketData();

    expect(safeFetch).toHaveBeenCalledTimes(1);
  });

  it("never caches a failure, so the next call retries immediately", async () => {
    safeFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    safeFetch.mockResolvedValueOnce(jsonResponse([REAL_ROW]));

    const first = await getCachedCryptoMarketData();
    const second = await getCachedCryptoMarketData();

    expect(first.ok).toBe(false);
    expect(second.ok).toBe(true);
    expect(safeFetch).toHaveBeenCalledTimes(2);
  });
});
