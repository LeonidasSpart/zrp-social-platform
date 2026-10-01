/*
 * ZRP Launchpad, phase 10: DEX aggregator - QUOTE ONLY, deliberately.
 *
 * Executing a real swap means building a transaction that moves a
 * user's funds and getting it signed - a materially different risk
 * (and UX) than every "sign a message to prove ownership" flow this
 * launchpad uses elsewhere. Reintroducing that would mean either (a)
 * the platform custodying the swap itself (the exact custody risk the
 * whole launchpad has avoided since Phase 1's wallet-adapter removal),
 * or (b) a full in-browser transaction-signing integration, out of
 * scope for what the roadmap calls a "utility feature." Instead this
 * calls Jupiter's public quote API (jup.ag) - the de facto Solana
 * aggregator - for a read-only best-price-across-DEXs quote, and the
 * UI links out to Jupiter's own app to actually execute. No funds,
 * keys, or transactions ever touch this codebase.
 *
 * "Never fake an integration": a failed/unreachable quote call throws
 * rather than returning a fabricated price.
 */

const JUPITER_QUOTE_URL = "https://quote-api.jup.ag/v6/quote";

export interface SwapQuoteParams {
  inputMint: string;
  outputMint: string;
  amountRaw: string;
  slippageBps?: number;
}

export interface SwapQuoteRoutePlanStep {
  label: string;
  percent: number;
}

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmountRaw: string;
  outAmountRaw: string;
  priceImpactPercent: number;
  routePlan: SwapQuoteRoutePlanStep[];
}

interface JupiterQuoteResponse {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  routePlan?: Array<{ swapInfo?: { label?: string }; percent?: number }>;
}

export async function getSwapQuote(params: SwapQuoteParams): Promise<SwapQuote> {
  const { inputMint, outputMint, amountRaw, slippageBps = 50 } = params;

  const url = new URL(JUPITER_QUOTE_URL);
  url.searchParams.set("inputMint", inputMint);
  url.searchParams.set("outputMint", outputMint);
  url.searchParams.set("amount", amountRaw);
  url.searchParams.set("slippageBps", String(slippageBps));

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    throw new Error(`Jupiter quote request failed (${res.status}).`);
  }

  const data = (await res.json()) as JupiterQuoteResponse;
  if (!data || typeof data.outAmount !== "string") {
    throw new Error("Jupiter returned an unexpected quote response.");
  }

  return {
    inputMint: data.inputMint,
    outputMint: data.outputMint,
    inAmountRaw: data.inAmount,
    outAmountRaw: data.outAmount,
    priceImpactPercent: Number(data.priceImpactPct) * 100,
    routePlan: (data.routePlan ?? []).map((step) => ({
      label: step.swapInfo?.label ?? "Unknown",
      percent: step.percent ?? 0,
    })),
  };
}

export function buildJupiterSwapLink(inputMint: string, outputMint: string): string {
  return `https://jup.ag/swap/${inputMint}-${outputMint}`;
}
