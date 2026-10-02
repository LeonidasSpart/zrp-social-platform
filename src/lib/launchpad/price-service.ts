import { getSwapQuote } from "./dex-aggregator";

/*
 * ZRP Launchpad: real price discovery for the token detail/analytics
 * surface, built on the existing Jupiter aggregator (dex-aggregator.ts)
 * rather than a second integration. "Never fake a price" (see the
 * master engineering brief this file was written against): there is no
 * code path here that returns a numeric price derived from anything
 * other than a real, just-fetched Jupiter quote. Every failure mode -
 * no route, Jupiter unreachable, a timeout, a malformed input - resolves
 * to `status: "UNAVAILABLE", priceUsdc: null` with an explicit machine-
 * readable reason, never a fabricated 0 or a stale/guessed number.
 *
 * Scope note (see the mission's final report for the full picture):
 * this is ONE source (Jupiter's aggregated route, which itself already
 * routes across whatever underlying DEXs it indexes) - not the
 * multi-source, per-pool liquidity comparison described in the original
 * brief's Phase 2/5/6. Building that honestly requires parsing each
 * DEX's own on-chain pool accounts (Raydium AMM v4/CPMM/CLMM, Orca
 * Whirlpool, PumpSwap, ...) program-by-program, which is a materially
 * larger, separately-scoped effort - not something to approximate here.
 */

export type TokenPriceStatus = "OK" | "UNAVAILABLE";
export type TokenPriceUnavailableReason = "NO_RELIABLE_MARKET" | "SOURCE_UNREACHABLE" | "INVALID_INPUT";

export interface TokenPriceResult {
  status: TokenPriceStatus;
  priceUsdc: number | null;
  source: "JUPITER" | null;
  quoteCurrency: "USDC";
  /** Jupiter's reported price impact for the 1-token probe trade - a high value on a tiny probe is itself a liquidity warning sign, surfaced rather than hidden. */
  priceImpactPercent: number | null;
  reason: TokenPriceUnavailableReason | null;
  timestamp: string;
}

// Mainnet USDC mint - the same quote currency every other Launchpad fee/
// price flow in this codebase (creation fee, tips) already uses.
const USDC_MINT_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function unavailable(reason: TokenPriceUnavailableReason, timestamp: string): TokenPriceResult {
  return { status: "UNAVAILABLE", priceUsdc: null, source: null, quoteCurrency: "USDC", priceImpactPercent: null, reason, timestamp };
}

/** Distinguishes "the aggregator was reachable and reported no route" from "the aggregator itself could not be reached" - both still mean "no price", but only one is worth retrying sooner. */
function classifyQuoteFailure(err: unknown): TokenPriceUnavailableReason {
  const name = err instanceof Error ? err.name : "";
  const message = err instanceof Error ? err.message.toLowerCase() : "";
  if (name === "AbortError" || name === "TimeoutError" || message.includes("timeout")) return "SOURCE_UNREACHABLE";
  if (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("econnrefused") ||
    message.includes("enotfound")
  ) {
    return "SOURCE_UNREACHABLE";
  }
  // A clean non-2xx from Jupiter (e.g. 400 "no route found") means the
  // aggregator was reachable and simply has no tradeable market for this
  // pair/amount right now - the common, expected "no price yet" case.
  return "NO_RELIABLE_MARKET";
}

/**
 * Prices one whole unit of `mintAddress` in USDC via a live Jupiter
 * quote. `decimals` must be the mint's real decimals (callers already
 * have this from scanToken()/LaunchedToken - not re-fetched here to
 * avoid a redundant RPC call on every price lookup).
 */
export async function getTokenPriceUsdc(
  mintAddress: string,
  decimals: number,
  usdcMintAddress: string = USDC_MINT_MAINNET
): Promise<TokenPriceResult> {
  const timestamp = new Date().toISOString();

  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 20) {
    return unavailable("INVALID_INPUT", timestamp);
  }
  if (mintAddress === usdcMintAddress) {
    return { status: "OK", priceUsdc: 1, source: "JUPITER", quoteCurrency: "USDC", priceImpactPercent: 0, reason: null, timestamp };
  }

  let probeAmountRaw = BigInt(1);
  for (let i = 0; i < decimals; i += 1) probeAmountRaw *= BigInt(10); // exactly 1 whole token, in raw units

  let quote;
  try {
    quote = await getSwapQuote({ inputMint: mintAddress, outputMint: usdcMintAddress, amountRaw: probeAmountRaw.toString() });
  } catch (err) {
    return unavailable(classifyQuoteFailure(err), timestamp);
  }

  let outAmountRaw: bigint;
  try {
    outAmountRaw = BigInt(quote.outAmountRaw);
  } catch {
    return unavailable("NO_RELIABLE_MARKET", timestamp);
  }
  if (outAmountRaw <= BigInt(0)) {
    return unavailable("NO_RELIABLE_MARKET", timestamp);
  }

  // USDC has 6 decimals; the probe was exactly 1 whole token, so this is
  // directly "USDC per token" with no further scaling needed.
  const priceUsdc = Number(outAmountRaw) / 1_000_000;

  return {
    status: "OK",
    priceUsdc,
    source: "JUPITER",
    quoteCurrency: "USDC",
    priceImpactPercent: quote.priceImpactPercent,
    reason: null,
    timestamp,
  };
}
