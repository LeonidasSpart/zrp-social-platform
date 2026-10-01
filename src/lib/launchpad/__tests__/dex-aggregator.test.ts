import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getSwapQuote, buildJupiterSwapLink, getSwapTransaction } from "../dex-aggregator";

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
    // The verbatim Jupiter response is carried through - getSwapTransaction
    // needs this exact object back, not our normalized fields.
    expect(quote.raw).toEqual({
      inputMint: "So11111111111111111111111111111111111111112",
      outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      inAmount: "1000000000",
      outAmount: "95000000",
      priceImpactPct: "0.012",
      routePlan: [{ swapInfo: { label: "Orca" }, percent: 100 }],
    });
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

describe("getSwapTransaction", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("asks Jupiter to build the swap transaction with the caller's own wallet as userPublicKey", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ swapTransaction: "base64-encoded-tx", lastValidBlockHeight: 123456789 }),
    });

    const result = await getSwapTransaction({
      quoteResponse: { inputMint: "a", outputMint: "b" },
      userPublicKey: "UserWalletBase58Placeholder111111111",
    });

    expect(result).toEqual({ swapTransactionBase64: "base64-encoded-tx", lastValidBlockHeight: 123456789 });
    const [, requestInit] = (global.fetch as any).mock.calls[0];
    const sentBody = JSON.parse(requestInit.body);
    expect(sentBody.userPublicKey).toBe("UserWalletBase58Placeholder111111111");
    // The quoteResponse is relayed verbatim, never reconstructed.
    expect(sentBody.quoteResponse).toEqual({ inputMint: "a", outputMint: "b" });
  });

  it("never fakes a swap transaction - throws on a non-ok response", async () => {
    (global.fetch as any).mockResolvedValue({ ok: false, status: 400 });

    await expect(
      getSwapTransaction({ quoteResponse: {}, userPublicKey: "wallet" })
    ).rejects.toThrow();
  });

  it("throws on a malformed response rather than returning a partial transaction", async () => {
    (global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ unexpected: true }) });

    await expect(
      getSwapTransaction({ quoteResponse: {}, userPublicKey: "wallet" })
    ).rejects.toThrow();
  });
});
