/*
 * ZRP Launchpad, phase 10/11: DEX aggregator via Jupiter.
 *
 * Quoting (getSwapQuote) was always safe - read-only, no funds or keys
 * involved. Execution was deliberately deferred: building a transaction
 * that moves a user's funds and getting it signed is a materially
 * different risk than every "sign a message to prove ownership" flow
 * this launchpad used elsewhere at the time, and the only way to do it
 * without the platform custodying the swap itself (the exact custody
 * risk the whole launchpad has avoided since Phase 1's wallet-adapter
 * removal) was a full in-browser transaction-signing integration.
 *
 * That integration now exists (injected-wallet.ts's signTransaction,
 * proven by the atomic token-creation flow in client-token-mint.ts), so
 * execution is no longer out of scope: getSwapTransaction asks Jupiter
 * to build the swap as a transaction with the user's own wallet as fee
 * payer and only signer, and src/lib/launchpad/client-swap.ts has that
 * same wallet sign and broadcast it. ZRP never holds funds, keys, or a
 * signature at any point - it only relays an opaque quote/transaction
 * payload between the browser and Jupiter's public API.
 *
 * "Never fake an integration": a failed/unreachable call throws rather
 * than returning a fabricated price or transaction.
 */

const JUPITER_QUOTE_URL = "https://quote-api.jup.ag/v6/quote";
const JUPITER_SWAP_URL = "https://quote-api.jup.ag/v6/swap";

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
  // The verbatim Jupiter quote response, opaque to us. Jupiter's /swap
  // endpoint requires this exact object back (its internal shape can
  // change between API versions), so it's carried through the quote
  // round-trip to the browser and echoed back unmodified when the user
  // asks to execute - never reconstructed from the normalized fields
  // above, which would risk silently diverging from what was quoted.
  raw: unknown;
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
    raw: data,
  };
}

export function buildJupiterSwapLink(inputMint: string, outputMint: string): string {
  return `https://jup.ag/swap/${inputMint}-${outputMint}`;
}

export interface SwapTransactionParams {
  // The verbatim SwapQuote.raw object from a prior getSwapQuote() call -
  // never re-derived from the normalized quote fields.
  quoteResponse: unknown;
  userPublicKey: string;
}

export interface SwapTransaction {
  // Base64-encoded, Jupiter-built VersionedTransaction. The user's own
  // wallet is its fee payer and sole signer - ZRP never signs, holds, or
  // even sees a signed copy of this.
  swapTransactionBase64: string;
  lastValidBlockHeight: number;
}

interface JupiterSwapResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
}

export async function getSwapTransaction(params: SwapTransactionParams): Promise<SwapTransaction> {
  const { quoteResponse, userPublicKey } = params;

  const res = await fetch(JUPITER_SWAP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quoteResponse, userPublicKey, wrapAndUnwrapSol: true }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Jupiter swap-transaction request failed (${res.status}).`);
  }

  const data = (await res.json()) as JupiterSwapResponse;
  if (!data || typeof data.swapTransaction !== "string" || typeof data.lastValidBlockHeight !== "number") {
    throw new Error("Jupiter returned an unexpected swap-transaction response.");
  }

  return { swapTransactionBase64: data.swapTransaction, lastValidBlockHeight: data.lastValidBlockHeight };
}
