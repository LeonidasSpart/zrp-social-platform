import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { scanToken } = vi.hoisted(() => ({ scanToken: vi.fn() }));
vi.mock("@/lib/launchpad/token-scanner", () => ({ scanToken }));

import { GET } from "../[mint]/route";

function req() {
  return new NextRequest("https://zrp.one/api/launchpad/scanner/x", {
    headers: { "x-forwarded-for": "10.0.0.50" },
  });
}

describe("GET /api/launchpad/scanner/[mint]", () => {
  beforeEach(() => {
    scanToken.mockReset();
  });

  it("rejects an invalid mint address (400) without calling scanToken", async () => {
    const res = await GET(req(), { params: Promise.resolve({ mint: "not-a-valid-pubkey" }) });
    expect(res.status).toBe(400);
    expect(scanToken).not.toHaveBeenCalled();
  });

  it("happy path: returns the scan result for a valid mint", async () => {
    const validMint = "So11111111111111111111111111111111111111112";
    scanToken.mockResolvedValue({
      mintAddress: validMint,
      supplyRaw: "1000000000",
      decimals: 9,
      mintAuthority: null,
      freezeAuthority: null,
      metadata: null,
      topHolders: [],
      topHolderConcentrationPercent: 0,
      riskFlags: ["metadata_missing"],
    });

    const res = await GET(req(), { params: Promise.resolve({ mint: validMint }) });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.scan.mintAddress).toBe(validMint);
    expect(data.scan.riskFlags).toContain("metadata_missing");
  });

  it("returns 502 when the scan itself fails (bad mint, RPC unavailable)", async () => {
    const validMint = "So11111111111111111111111111111111111111112";
    scanToken.mockRejectedValue(new Error("RPC unreachable"));

    const res = await GET(req(), { params: Promise.resolve({ mint: validMint }) });
    expect(res.status).toBe(502);
  });
});
