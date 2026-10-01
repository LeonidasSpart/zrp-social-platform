import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { getSwapQuote, buildJupiterSwapLink } = vi.hoisted(() => ({
  getSwapQuote: vi.fn(),
  buildJupiterSwapLink: vi.fn(),
}));
vi.mock("@/lib/launchpad/dex-aggregator", () => ({ getSwapQuote, buildJupiterSwapLink }));

import { GET } from "../quote/route";

const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function req(query: string) {
  return new NextRequest(`https://zrp.one/api/launchpad/swap/quote?${query}`, {
    headers: { "x-forwarded-for": "10.0.0.51" },
  });
}

describe("GET /api/launchpad/swap/quote", () => {
  beforeEach(() => {
    getSwapQuote.mockReset();
    buildJupiterSwapLink.mockReset();
  });

  it("rejects an invalid inputMint (400) without calling getSwapQuote", async () => {
    const res = await GET(req(`inputMint=not-valid&outputMint=${USDC}&amount=1000000`));
    expect(res.status).toBe(400);
    expect(getSwapQuote).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric amount (400)", async () => {
    const res = await GET(req(`inputMint=${SOL}&outputMint=${USDC}&amount=abc`));
    expect(res.status).toBe(400);
    expect(getSwapQuote).not.toHaveBeenCalled();
  });

  it("happy path: returns the quote plus a Jupiter swap link", async () => {
    getSwapQuote.mockResolvedValue({
      inputMint: SOL,
      outputMint: USDC,
      inAmountRaw: "1000000000",
      outAmountRaw: "95000000",
      priceImpactPercent: 1.2,
      routePlan: [{ label: "Orca", percent: 100 }],
    });
    buildJupiterSwapLink.mockReturnValue(`https://jup.ag/swap/${SOL}-${USDC}`);

    const res = await GET(req(`inputMint=${SOL}&outputMint=${USDC}&amount=1000000000`));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.quote.outAmountRaw).toBe("95000000");
    expect(data.swapLink).toBe(`https://jup.ag/swap/${SOL}-${USDC}`);
  });

  it("returns 502 when the quote fetch fails rather than fabricating one", async () => {
    getSwapQuote.mockRejectedValue(new Error("Jupiter unreachable"));
    const res = await GET(req(`inputMint=${SOL}&outputMint=${USDC}&amount=1000000000`));
    expect(res.status).toBe(502);
  });
});
