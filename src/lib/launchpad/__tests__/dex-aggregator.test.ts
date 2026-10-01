import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getSwapQuote, buildJupiterSwapLink } from "../dex-aggregator";

describe("getSwapQuote", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("maps a successful Jupiter response into a SwapQuote", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        inputMint: "So11111111111111111111111111111111111111112",
        outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        inAmount: "1000000000",
        outAmount: "95000000",
        priceImpactPct: "0.012",
        routePlan: [{ swapInfo: { label: "Orca" }, percent: 100 }],
      }),
    });

    const quote = await getSwapQuote({
      inputMint: "So11111111111111111111111111111111111111112",
      outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      amountRaw: "1000000000",
    });

    expect(quote.outAmountRaw).toBe("95000000");
    expect(quote.priceImpactPercent).toBeCloseTo(1.2, 5);
    expect(quote.routePlan).toEqual([{ label: "Orca", percent: 100 }]);
  });

  it("never fakes a quote - throws on a non-ok response instead of fabricating a price", async () => {
    (global.fetch as any).mockResolvedValue({ ok: false, status: 503 });

    await expect(
      getSwapQuote({ inputMint: "a", outputMint: "b", amountRaw: "1000" })
    ).rejects.toThrow();
  });

  it("throws on a malformed response rather than returning a partial quote", async () => {
    (global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ unexpected: true }) });

    await expect(
      getSwapQuote({ inputMint: "a", outputMint: "b", amountRaw: "1000" })
    ).rejects.toThrow();
  });
});

describe("buildJupiterSwapLink", () => {
  it("builds a jup.ag swap URL from the two mints", () => {
    expect(buildJupiterSwapLink("MINT_A", "MINT_B")).toBe("https://jup.ag/swap/MINT_A-MINT_B");
  });
});
