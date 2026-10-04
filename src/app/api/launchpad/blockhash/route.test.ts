import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { getConnection, rateLimit } = vi.hoisted(() => ({
  getConnection: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/solana", () => ({ getConnection }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit }));

import { GET } from "./route";

function req(): NextRequest {
  return new NextRequest("https://zrp.one/api/launchpad/blockhash");
}

describe("GET /api/launchpad/blockhash", () => {
  beforeEach(() => {
    getConnection.mockReset();
    rateLimit.mockReset();
  });

  it("returns the connection's latest blockhash", async () => {
    rateLimit.mockResolvedValue({ success: true });
    getConnection.mockReturnValue({
      getLatestBlockhash: vi.fn().mockResolvedValue({
        blockhash: "EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTvK3eWG6",
        lastValidBlockHeight: 123,
      }),
    });

    const response = await GET(req());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ blockhash: "EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTvK3eWG6" });
  });

  it("is rate-limited before touching the connection", async () => {
    const limitedResponse = new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 });
    rateLimit.mockResolvedValue({ success: false, response: limitedResponse });

    const response = await GET(req());
    expect(response.status).toBe(429);
    expect(getConnection).not.toHaveBeenCalled();
  });
});
