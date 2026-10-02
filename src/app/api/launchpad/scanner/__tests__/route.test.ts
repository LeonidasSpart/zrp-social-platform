import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { scanToken } = vi.hoisted(() => ({ scanToken: vi.fn() }));
vi.mock("@/lib/launchpad/token-scanner", async () => {
  const actual = await vi.importActual<typeof import("@/lib/launchpad/token-scanner")>("@/lib/launchpad/token-scanner");
  return { ...actual, scanToken };
});
// This sandbox has no reachable Redis; without mocking, every call
// through rateLimit()'s real-Redis-retry path risks a 5000ms Vitest
// timeout (and can leak a slow resolution into the next test).
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn().mockResolvedValue({ success: true }) }));

import { GET } from "../[mint]/route";
import { TokenScanError } from "@/lib/launchpad/token-scanner";

function req() {
  return new NextRequest("https://zrp.one/api/launchpad/scanner/x", {
    headers: { "x-forwarded-for": "10.0.0.50" },
  });
}

const VALID_MINT = "So11111111111111111111111111111111111111112";

describe("GET /api/launchpad/scanner/[mint]", () => {
  beforeEach(() => {
    scanToken.mockReset();
  });

  it("rejects an invalid mint address (400) without calling scanToken", async () => {
    const res = await GET(req(), { params: Promise.resolve({ mint: "not-a-valid-pubkey" }) });
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.code).toBe("INVALID_MINT");
    expect(scanToken).not.toHaveBeenCalled();
  });

  it("happy path: returns the scan result for a valid mint, including tokenProgram", async () => {
    scanToken.mockResolvedValue({
      mintAddress: VALID_MINT,
      tokenProgram: "TOKEN_PROGRAM",
      supplyRaw: "1000000000",
      decimals: 9,
      mintAuthority: null,
      freezeAuthority: null,
      metadata: null,
      topHolders: [],
      topHolderConcentrationPercent: 0,
      riskFlags: ["metadata_missing"],
    });

    const res = await GET(req(), { params: Promise.resolve({ mint: VALID_MINT }) });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.scan.mintAddress).toBe(VALID_MINT);
    expect(data.scan.tokenProgram).toBe("TOKEN_PROGRAM");
    expect(data.scan.riskFlags).toContain("metadata_missing");
  });

  it("happy path: scans a Token-2022 mint without crashing (the production regression)", async () => {
    scanToken.mockResolvedValue({
      mintAddress: VALID_MINT,
      tokenProgram: "TOKEN_2022_PROGRAM",
      supplyRaw: "1000000000",
      decimals: 6,
      mintAuthority: null,
      freezeAuthority: null,
      metadata: { name: "Test", symbol: "TST", uri: "https://example.com", updateAuthority: "", isMutable: false },
      topHolders: [],
      topHolderConcentrationPercent: 0,
      riskFlags: [],
    });

    const res = await GET(req(), { params: Promise.resolve({ mint: VALID_MINT }) });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.scan.tokenProgram).toBe("TOKEN_2022_PROGRAM");
  });

  const cases: Array<[string, number]> = [
    ["INVALID_MINT", 400],
    ["TOKEN_NOT_FOUND", 404],
    ["UNSUPPORTED_TOKEN_PROGRAM", 422],
    ["RPC_UNAVAILABLE", 503],
    ["RPC_TIMEOUT", 504],
    ["INTERNAL_SCAN_ERROR", 500],
  ];

  for (const [code, status] of cases) {
    it(`maps TokenScanError(${code}) to HTTP ${status} with the code in the body`, async () => {
      scanToken.mockRejectedValue(new TokenScanError(code as never, `simulated ${code}`));
      const res = await GET(req(), { params: Promise.resolve({ mint: VALID_MINT }) });
      const data = await res.json();
      expect(res.status).toBe(status);
      expect(data.code).toBe(code);
      expect(typeof data.error).toBe("string");
      expect(data.error.length).toBeGreaterThan(0);
    });
  }

  it("classifies an unclassified thrown error as INTERNAL_SCAN_ERROR (500), never a silent all-clear", async () => {
    scanToken.mockRejectedValue(new Error("something truly unexpected"));
    const res = await GET(req(), { params: Promise.resolve({ mint: VALID_MINT }) });
    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data.code).toBe("INTERNAL_SCAN_ERROR");
  });
});
