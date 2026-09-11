import { safeFetch } from "@/lib/ssrf-guard";

/*
 * ============================================================
 * Crypto market data
 * ============================================================
 *
 * Top cryptocurrencies by market cap, from CoinGecko's public markets
 * endpoint - no API key required, which is why it is the default here
 * rather than a paid provider. Swap PROVIDER_URL for a different one
 * (CoinMarketCap, CoinCap, an exchange's own API) if ZRP later wants a
 * paid tier; nothing else in this file assumes CoinGecko's specific
 * shape beyond the mapping in `toMarketRow`.
 *
 * Absolute rule, twice over - it is both a platform design rule ("never
 * ship fake data") and an explicit instruction for this feature: a
 * provider failure returns `{ ok: false }`, never a fabricated or stale
 * value dressed up as current. The caller decides what to show for
 * that; this module never invents a number.
 */

const PROVIDER_URL =
  "https://api.coingecko.com/api/v3/coins/markets" +
  "?vs_currency=usd&order=market_cap_desc&per_page=100&page=1" +
  "&sparkline=false&price_change_percentage=24h";

const FETCH_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 500_000;

/** One row of the public API's coins/markets response we actually use. */
interface CoinGeckoMarketRow {
  id: unknown;
  symbol: unknown;
  name: unknown;
  image: unknown;
  current_price: unknown;
  market_cap: unknown;
  market_cap_rank: unknown;
  total_volume: unknown;
  price_change_percentage_24h: unknown;
}

export interface CryptoMarketRow {
  id: string;
  symbol: string;
  name: string;
  image: string | null;
  priceUsd: number;
  marketCapUsd: number;
  rank: number;
  volume24hUsd: number;
  priceChangePercent24h: number | null;
}

export type CryptoMarketResult =
  | { ok: true; rows: CryptoMarketRow[]; fetchedAt: Date }
  | { ok: false; error: string };

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Validates and narrows one provider row. Returns null for a row
 * missing a field this feature actually needs, rather than substituting
 * a guessed value - a partially-unusable row is dropped, not patched.
 */
function toMarketRow(raw: unknown): CryptoMarketRow | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as CoinGeckoMarketRow;

  if (
    typeof row.id !== "string" ||
    typeof row.symbol !== "string" ||
    typeof row.name !== "string" ||
    !isFiniteNumber(row.current_price) ||
    !isFiniteNumber(row.market_cap) ||
    !isFiniteNumber(row.market_cap_rank) ||
    !isFiniteNumber(row.total_volume)
  ) {
    return null;
  }

  return {
    id: row.id,
    symbol: row.symbol.toUpperCase(),
    name: row.name,
    image: typeof row.image === "string" && /^https:\/\//i.test(row.image) ? row.image : null,
    priceUsd: row.current_price,
    marketCapUsd: row.market_cap,
    rank: row.market_cap_rank,
    volume24hUsd: row.total_volume,
    priceChangePercent24h: isFiniteNumber(row.price_change_percentage_24h)
      ? row.price_change_percentage_24h
      : null,
  };
}

/**
 * Fetches the current top-100 market snapshot. Never throws: any
 * failure - network, timeout, a non-2xx, a response that is not the
 * shape expected - comes back as `{ ok: false, error }` so the caller
 * can show a real "unavailable" state instead of stale or invented
 * numbers.
 */
export async function fetchCryptoMarketData(
  options: { url?: string } = {}
): Promise<CryptoMarketResult> {
  let response;
  try {
    response = await safeFetch(options.url ?? PROVIDER_URL, {
      timeoutMs: FETCH_TIMEOUT_MS,
      maxBytes: MAX_RESPONSE_BYTES,
      headers: {
        Accept: "application/json",
        "User-Agent": "ZRPNewsBot/1.0 (+https://zrp.one/about; crypto market data)",
      },
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Fetch failed" };
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    return { ok: false, error: `Provider returned HTTP ${response.statusCode}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.body.toString("utf-8"));
  } catch {
    return { ok: false, error: "Provider response was not valid JSON" };
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, error: "Provider response was not a list of coins" };
  }

  const rows = parsed.map(toMarketRow).filter((row): row is CryptoMarketRow => row !== null);

  if (rows.length === 0) {
    return { ok: false, error: "Provider returned no usable rows" };
  }

  return { ok: true, rows, fetchedAt: new Date() };
}

/**
 * A short in-process cache so a page full of viewers does not each
 * trigger their own upstream call, and so the free tier's rate limit is
 * respected. Per server instance, not shared - acceptable for data this
 * short-lived, and it fails open to a real fetch rather than serving a
 * stale entry past its TTL.
 */
const CACHE_TTL_MS = 60_000;
let cached: { result: CryptoMarketResult; expiresAt: number } | null = null;

export async function getCachedCryptoMarketData(): Promise<CryptoMarketResult> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.result;

  const result = await fetchCryptoMarketData();

  // Never cache a failure: the next request should retry immediately
  // rather than propagate an outage for a full TTL window.
  if (result.ok) {
    cached = { result, expiresAt: now + CACHE_TTL_MS };
  } else {
    cached = null;
  }

  return result;
}

/** Test-only: clears the module-level cache between test cases. */
export function _resetCryptoMarketDataCacheForTests() {
  cached = null;
}
