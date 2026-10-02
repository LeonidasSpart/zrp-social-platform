import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { getCachedTokenAnalytics } = vi.hoisted(() => ({ getCachedTokenAnalytics: vi.fn() }));
vi.mock("@/lib/launchpad/token-analytics", () => ({ getCachedTokenAnalytics }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn().mockResolvedValue({ success: true }) }));

import { GET } from "../route";
import { TokenScanError } from "@/lib/launchpad/token-scanner";

function req() {
  return new NextRequest("https://zrp.one/api/launchpad/tokens/x/analytics", {
    headers: { "x-forwarded-for": "10.0.0.50" },
  });
}

const VALID_MINT = "So11111111111111111111111111111111111111112";

describe("GET /api/launchpad/tokens/[mint]/analytics", () => {
  beforeEach(() => {
    getCachedTokenAnalytics.mockReset();
  });

  it("rejects an invalid mint (400) without calling the analytics service", async () => {
    const res = await GET(req(), { params: Promise.resolve({ mint: "not-a-mint" }) });
    expect(res.status).toBe(400);
    expect(getCachedTokenAnalytics).not.toHaveBeenCalled();
  });

  it("returns the analytics payload for a valid mint", async () => {
    const payload = { token: { mintAddress: VALID_MINT }, market: { priceUsdc: null }, updatedAt: "2026-01-01T00:00:00.000Z" };
    getCachedTokenAnalytics.mockResolvedValue(payload);

    const res = await GET(req(), { params: Promise.resolve({ mint: VALID_MINT }) });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toEqual(payload);
  });

  it("maps a TokenScanError to its classified HTTP status, not a generic 500", async () => {
    getCachedTokenAnalytics.mockRejectedValue(new TokenScanError("TOKEN_NOT_FOUND", "no account"));
    const res = await GET(req(), { params: Promise.resolve({ mint: VALID_MINT }) });
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.code).toBe("TOKEN_NOT_FOUND");
  });

  it("classifies an unexpected error as INTERNAL_SCAN_ERROR (500)", async () => {
    getCachedTokenAnalytics.mockRejectedValue(new Error("boom"));
    const res = await GET(req(), { params: Promise.resolve({ mint: VALID_MINT }) });
    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data.code).toBe("INTERNAL_SCAN_ERROR");
  });
});
