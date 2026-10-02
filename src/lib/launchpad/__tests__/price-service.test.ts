import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSwapQuote } = vi.hoisted(() => ({ getSwapQuote: vi.fn() }));
vi.mock("../dex-aggregator", () => ({ getSwapQuote }));

import { getTokenPriceUsdc } from "../price-service";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TOKEN_MINT = "TokEn1111111111111111111111111111111111111";

describe("getTokenPriceUsdc", () => {
  beforeEach(() => {
    getSwapQuote.mockReset();
  });

  it("returns a real price derived from a live Jupiter quote, never a guessed number", async () => {
    getSwapQuote.mockResolvedValue({ outAmountRaw: "2500000", priceImpactPercent: 0.12, raw: {} });

    const result = await getTokenPriceUsdc(TOKEN_MINT, 6);
    expect(result.status).toBe("OK");
    expect(result.priceUsdc).toBeCloseTo(2.5, 6);
    expect(result.source).toBe("JUPITER");
    expect(result.priceImpactPercent).toBeCloseTo(0.12, 6);
    expect(getSwapQuote).toHaveBeenCalledWith({
      inputMint: TOKEN_MINT,
      outputMint: USDC_MINT,
      amountRaw: "1000000", // 1 whole token at 6 decimals
    });
  });

  it("probes with exactly 1 whole token regardless of decimals", async () => {
    getSwapQuote.mockResolvedValue({ outAmountRaw: "1", priceImpactPercent: 99, raw: {} });
    await getTokenPriceUsdc(TOKEN_MINT, 9);
    expect(getSwapQuote).toHaveBeenCalledWith(expect.objectContaining({ amountRaw: "1000000000" }));
  });

  it("returns UNAVAILABLE/NO_RELIABLE_MARKET - never a price of 0 - when Jupiter reports no route", async () => {
    getSwapQuote.mockRejectedValue(new Error("Jupiter quote request failed (400)."));

    const result = await getTokenPriceUsdc(TOKEN_MINT, 6);
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.priceUsdc).toBeNull();
    expect(result.reason).toBe("NO_RELIABLE_MARKET");
  });

  it("distinguishes a genuinely unreachable source from a clean no-route response", async () => {
    const timeoutErr = new Error("The operation was aborted due to timeout");
    timeoutErr.name = "AbortError";
    getSwapQuote.mockRejectedValue(timeoutErr);

    const result = await getTokenPriceUsdc(TOKEN_MINT, 6);
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.reason).toBe("SOURCE_UNREACHABLE");
  });

  it("treats a network-failure fetch error as SOURCE_UNREACHABLE", async () => {
    getSwapQuote.mockRejectedValue(new TypeError("fetch failed"));
    const result = await getTokenPriceUsdc(TOKEN_MINT, 6);
    expect(result.reason).toBe("SOURCE_UNREACHABLE");
  });

  it("returns UNAVAILABLE when the quote resolves but reports a zero/negative output", async () => {
    getSwapQuote.mockResolvedValue({ outAmountRaw: "0", priceImpactPercent: 0, raw: {} });
    const result = await getTokenPriceUsdc(TOKEN_MINT, 6);
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.reason).toBe("NO_RELIABLE_MARKET");
  });

  it("rejects invalid decimals as INVALID_INPUT without calling Jupiter", async () => {
    const result = await getTokenPriceUsdc(TOKEN_MINT, -1);
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.reason).toBe("INVALID_INPUT");
    expect(getSwapQuote).not.toHaveBeenCalled();
  });

  it("shortcuts to price 1.0 when the mint IS USDC itself, without calling Jupiter", async () => {
    const result = await getTokenPriceUsdc(USDC_MINT, 6);
    expect(result.status).toBe("OK");
    expect(result.priceUsdc).toBe(1);
    expect(getSwapQuote).not.toHaveBeenCalled();
  });
});
