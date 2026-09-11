import { describe, it, expect, beforeEach, vi } from "vitest";

const { getCachedCryptoMarketData } = vi.hoisted(() => ({
  getCachedCryptoMarketData: vi.fn(),
}));
vi.mock("@/lib/crypto-market-data", () => ({ getCachedCryptoMarketData }));

import { GET } from "../route";

describe("GET /api/news/crypto/market", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the real rows on success", async () => {
    const fetchedAt = new Date("2026-02-03T12:00:00Z");
    getCachedCryptoMarketData.mockResolvedValue({
      ok: true,
      fetchedAt,
      rows: [{ id: "bitcoin", symbol: "BTC", name: "Bitcoin", rank: 1 }],
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.rows).toHaveLength(1);
    expect(body.fetchedAt).toBe(fetchedAt.toISOString());
  });

  /*
   * The one rule this route exists to enforce at the API boundary: a
   * provider failure is an honest 503 with a generic message, never a
   * 200 with fabricated or stale rows dressed up as a real snapshot.
   */
  it("never fabricates a snapshot when the provider fails", async () => {
    getCachedCryptoMarketData.mockResolvedValue({
      ok: false,
      error: "Provider returned HTTP 429",
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.success).toBe(false);
    // The real provider error is logged server-side, not echoed to the
    // client - the client gets a generic, human message.
    expect(body.error).not.toContain("429");
    expect(typeof body.error).toBe("string");
    expect(body.rows).toBeUndefined();
  });

  it("never fabricates a snapshot when the lookup itself throws", async () => {
    getCachedCryptoMarketData.mockRejectedValue(new Error("unexpected"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.success).toBe(false);
  });

  it("never caches a failed response at the HTTP layer", async () => {
    getCachedCryptoMarketData.mockResolvedValue({ ok: false, error: "down" });

    const response = await GET();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
