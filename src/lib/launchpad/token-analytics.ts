import { prisma } from "@/lib/db";
import { scanToken, TokenScanError, type TokenProgramKind } from "./token-scanner";
import { getTokenPriceUsdc, type TokenPriceStatus, type TokenPriceUnavailableReason } from "./price-service";

/*
 * ZRP Launchpad: the token intelligence endpoint behind /launchpad/token/[mint].
 * Combines real on-chain state (via the fixed token-scanner.ts) with a
 * real Jupiter-derived price (price-service.ts) and, where the mint is
 * one ZRP itself launched, the extra off-chain metadata recorded at
 * creation time. Business logic lives here, not in the page component.
 *
 * Every field that cannot be independently verified right now is
 * explicit about it (`status: "UNAVAILABLE"` + a machine-readable
 * reason) rather than silently defaulting to 0/null with no explanation.
 * Three fields are deliberately NOT implemented in this pass, and are
 * reported as such rather than faked:
 *
 *  - volume: real trading-volume analytics need either a licensed
 *    market-data indexer (Birdeye, Helius enhanced APIs, ...) or a
 *    custom pipeline that ingests and classifies swap transactions over
 *    time. Neither exists in this codebase.
 *  - liquidity / pools: per-DEX on-chain pool account parsing (Raydium
 *    AMM v4/CPMM/CLMM, Orca Whirlpool, PumpSwap, ...) is a materially
 *    larger, separately-scoped integration project, not something to
 *    approximate from a single Jupiter quote.
 *  - holders.topHolders are the top 10 token ACCOUNTS by balance
 *    (getTokenLargestAccounts, real data) - NOT deduplicated owner
 *    wallets, and not filtered for pool/program/burn addresses. A full
 *    "unique human holder" count needs enumerating every token account
 *    for the mint (getProgramAccounts with a size+memcmp filter) and
 *    resolving each to its owner, which is both a much heavier RPC call
 *    and a separate piece of work from what shipped here.
 */

export interface TokenAnalyticsIdentity {
  mintAddress: string;
  tokenProgram: TokenProgramKind;
  decimals: number;
  supplyRaw: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  metadata: { name: string; symbol: string; uri: string; updateAuthority: string; isMutable: boolean } | null;
  // Only populated when this mint is one ZRP itself launched (LaunchedToken row).
  launchedOnZrp: boolean;
  creator: { id: string; username: string; name: string | null; avatarUrl: string | null } | null;
  createdAt: string | null;
  description: string | null;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  discord: string | null;
}

export interface TokenAnalyticsMarket {
  priceUsdc: number | null;
  priceSource: "JUPITER" | null;
  priceStatus: TokenPriceStatus;
  priceUnavailableReason: TokenPriceUnavailableReason | null;
  priceImpactPercent: number | null;
  fdvUsdc: number | null;
  marketCapUsdc: null;
  marketCapUnavailableReason: "CIRCULATING_SUPPLY_UNKNOWN";
}

export interface TokenAnalyticsHolders {
  topHolderAccounts: Array<{ address: string; amountRaw: string; percent: number }>;
  top10ConcentrationPercent: number;
  status: "PARTIAL";
  note: string;
}

export interface TokenAnalyticsUnavailable {
  status: "UNAVAILABLE";
  reason: "NOT_IMPLEMENTED";
}

export interface TokenAnalytics {
  token: TokenAnalyticsIdentity;
  market: TokenAnalyticsMarket;
  holders: TokenAnalyticsHolders;
  volume: TokenAnalyticsUnavailable;
  liquidity: TokenAnalyticsUnavailable & { totalLiquidityUsd: null; pools: [] };
  pools: [];
  risk: { riskFlags: string[] };
  updatedAt: string;
}

function rawToDecimal(raw: string, decimals: number): number {
  // Safe for display math (FDV) only - never used for on-chain amounts,
  // which stay BigInt/string everywhere else in this codebase.
  return Number(BigInt(raw)) / 10 ** decimals;
}

export async function getTokenAnalytics(mintAddress: string): Promise<TokenAnalytics> {
  const scan = await scanToken(mintAddress); // throws TokenScanError on any real failure - never swallowed here

  const launchedToken = await prisma.launchedToken.findUnique({
    where: { mintAddress },
    select: {
      description: true,
      website: true,
      twitter: true,
      telegram: true,
      discord: true,
      createdAt: true,
      creator: { select: { id: true, username: true, name: true, avatarUrl: true } },
    },
  });

  const price = await getTokenPriceUsdc(mintAddress, scan.decimals);
  const supplyDecimal = rawToDecimal(scan.supplyRaw, scan.decimals);

  return {
    token: {
      mintAddress: scan.mintAddress,
      tokenProgram: scan.tokenProgram,
      decimals: scan.decimals,
      supplyRaw: scan.supplyRaw,
      mintAuthority: scan.mintAuthority,
      freezeAuthority: scan.freezeAuthority,
      metadata: scan.metadata,
      launchedOnZrp: launchedToken !== null,
      creator: launchedToken?.creator ?? null,
      createdAt: launchedToken?.createdAt?.toISOString() ?? null,
      description: launchedToken?.description ?? null,
      website: launchedToken?.website ?? null,
      twitter: launchedToken?.twitter ?? null,
      telegram: launchedToken?.telegram ?? null,
      discord: launchedToken?.discord ?? null,
    },
    market: {
      priceUsdc: price.priceUsdc,
      priceSource: price.source,
      priceStatus: price.status,
      priceUnavailableReason: price.reason,
      priceImpactPercent: price.priceImpactPercent,
      fdvUsdc: price.priceUsdc !== null ? price.priceUsdc * supplyDecimal : null,
      marketCapUsdc: null,
      marketCapUnavailableReason: "CIRCULATING_SUPPLY_UNKNOWN",
    },
    holders: {
      topHolderAccounts: scan.topHolders,
      top10ConcentrationPercent: scan.topHolderConcentrationPercent,
      status: "PARTIAL",
      note: "Top 10 token accounts by balance, not deduplicated owner wallets and not filtered for pool/program/burn addresses.",
    },
    volume: { status: "UNAVAILABLE", reason: "NOT_IMPLEMENTED" },
    liquidity: { status: "UNAVAILABLE", reason: "NOT_IMPLEMENTED", totalLiquidityUsd: null, pools: [] },
    pools: [],
    risk: { riskFlags: scan.riskFlags },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Short in-process cache (same pattern as getCachedCryptoMarketData in
 * crypto-market-data.ts): per server instance, not shared across
 * Railway replicas - acceptable for data this short-lived, and a
 * failure is never cached so the next request retries immediately
 * instead of propagating an outage for a full TTL window.
 */
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { result: TokenAnalytics; expiresAt: number }>();

export async function getCachedTokenAnalytics(mintAddress: string): Promise<TokenAnalytics> {
  const now = Date.now();
  const hit = cache.get(mintAddress);
  if (hit && hit.expiresAt > now) return hit.result;

  const result = await getTokenAnalytics(mintAddress); // lets TokenScanError propagate uncached
  cache.set(mintAddress, { result, expiresAt: now + CACHE_TTL_MS });
  return result;
}

/** Test-only: clears the module-level cache between test cases. */
export function _resetTokenAnalyticsCacheForTests() {
  cache.clear();
}

export { TokenScanError };
