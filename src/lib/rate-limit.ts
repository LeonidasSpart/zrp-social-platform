import { NextRequest, NextResponse } from "next/server";
import { getRedisClient } from "./redis";

export interface RateLimitConfig {
  limit: number;
  window: number;
  type: string;
}

/*
 * ============================================================
 * Client IP resolution (trusted-proxy semantics)
 * ============================================================
 *
 * ⚠️ SECURITY: this used to take the FIRST entry of X-Forwarded-For.
 * That entry is whatever the client itself chose to send - a caller
 * could set `X-Forwarded-For: 1.2.3.4` and get a fresh rate-limit
 * bucket on every request, defeating the login/API/upload limits
 * entirely. The production host (Railway) terminates TLS at its edge
 * proxy and APPENDS the real connecting address to X-Forwarded-For, so
 * the only entry that can't be forged by the client is the one added
 * by our own trusted proxy: counting from the RIGHT, the Nth entry
 * where N is the number of trusted proxy hops in front of the app.
 *
 * TRUSTED_PROXY_HOPS defaults to 1 (Railway's single edge proxy). If
 * another trusted reverse proxy/CDN is ever placed in front of it,
 * set it to that hop count. It is never read from the request.
 *
 * X-Real-IP is only consulted when no X-Forwarded-For exists at all
 * (it's a single-value header some proxies set instead), and the final
 * fallback is a fixed loopback bucket - direct, un-proxied traffic only
 * happens in local development.
 */

function trustedProxyHops(): number {
  const raw = parseInt(process.env.TRUSTED_PROXY_HOPS || "", 10);
  return Number.isFinite(raw) && raw >= 1 ? raw : 1;
}

// Loose shape check so a forged/garbage header value can't smuggle
// arbitrary text into rate-limit keys (or logs). IPv4, IPv6 (incl.
// IPv4-mapped) and nothing else.
const IP_SHAPE = /^[0-9a-fA-F.:]{3,45}$/;

function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;
  let ip = value.trim();
  // Strip an IPv4 port suffix ("1.2.3.4:5678") some proxies include.
  const v4Port = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (v4Port) ip = v4Port[1];
  // Strip bracketed IPv6 ("[::1]:5678" / "[::1]").
  const v6Bracket = ip.match(/^\[([0-9a-fA-F:.]+)\](?::\d+)?$/);
  if (v6Bracket) ip = v6Bracket[1];
  return IP_SHAPE.test(ip) ? ip : null;
}

/**
 * Resolve the client IP from a plain headers object - the shape
 * NextAuth's `authorize()` callback receives, where there's no
 * NextRequest. Applies the exact same trusted-proxy rule as
 * getRequestIp() so the login limiter can't disagree with every other
 * limiter about who a request is from.
 */
export function getClientIpFromHeaders(
  headers:
    | Headers
    | Record<string, string | string[] | undefined>
    | null
    | undefined
): string {
  const read = (name: string): string | null => {
    if (!headers) return null;
    if (typeof (headers as Headers).get === "function") {
      return (headers as Headers).get(name);
    }
    const record = headers as Record<string, string | string[] | undefined>;
    const value = record[name] ?? record[name.toLowerCase()];
    return Array.isArray(value) ? value.join(",") : value ?? null;
  };

  const forwarded = read("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      const index = Math.max(0, parts.length - trustedProxyHops());
      const ip = normalizeIp(parts[index]);
      if (ip) return ip;
    }
  }

  const real = normalizeIp(read("x-real-ip"));
  if (real) return real;

  return "127.0.0.1";
}

function getClientIp(req: NextRequest): string {
  return getClientIpFromHeaders(req.headers);
}

/*
 * ============================================================
 * In-process fallback limiter
 * ============================================================
 *
 * Used only when Redis is unavailable or errors, so a degraded
 * cache layer never fully removes rate limiting (fail-open).
 * This is per-instance and best-effort, not a substitute for
 * Redis under normal operation.
 */

interface LocalBucket {
  count: number;
  resetAt: number;
}

const localBuckets = new Map<string, LocalBucket>();

// Periodically drop expired buckets so the map can't grow unbounded.
let lastSweep = 0;
function sweepLocalBuckets(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  localBuckets.forEach((bucket, key) => {
    if (bucket.resetAt <= now) localBuckets.delete(key);
  });
}

function localRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): { success: boolean; retryAfter: number } {
  const now = Date.now();
  sweepLocalBuckets(now);

  let bucket = localBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowSeconds * 1000 };
    localBuckets.set(key, bucket);
  }

  bucket.count += 1;

  if (bucket.count > limit) {
    return {
      success: false,
      retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  return { success: true, retryAfter: 0 };
}

function tooManyRequestsResponse(limit: number, retryAfter: number) {
  return NextResponse.json(
    {
      error: "Too many requests. Please try again later.",
      retryAfter,
    },
    {
      status: 429,
      headers: {
        "X-RateLimit-Limit": limit.toString(),
        "X-RateLimit-Remaining": "0",
        "Retry-After": retryAfter.toString(),
      },
    }
  );
}

/**
 * Core limiter keyed by an arbitrary string, usable outside of a
 * NextRequest context (e.g. NextAuth's `authorize` callback, which
 * only gets a plain headers object).
 */
export async function checkRateLimitKey(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ success: boolean; retryAfter: number }> {
  const fullKey = `rate-limit:${key}`;

  try {
    const redis = await getRedisClient();

    if (!redis) {
      // Redis is unavailable: fall back to a local in-memory limiter
      // instead of allowing every request through unconditionally.
      return localRateLimit(fullKey, limit, windowSeconds);
    }

    // ⚠️ SECURITY: this used to be GET → (SET | INCR), two round trips
    // with no atomicity - N concurrent requests could all read the same
    // count and all be admitted, so a burst of parallel requests
    // sailed past the limit. INCR is atomic in Redis, so every
    // concurrent caller gets a distinct, strictly increasing count and
    // exactly `limit` of them are admitted per window.
    const count = await redis.incr(fullKey);

    if (count === 1) {
      // First hit in this window: start the window clock.
      await redis.expire(fullKey, windowSeconds);
    }

    if (count > limit) {
      let ttl = await redis.ttl(fullKey);
      if (ttl < 0) {
        // Key somehow lost its expiry (e.g. an EXPIRE that failed after
        // the INCR) - re-arm it rather than leaving a permanent block.
        await redis.expire(fullKey, windowSeconds);
        ttl = windowSeconds;
      }
      return { success: false, retryAfter: ttl > 0 ? ttl : windowSeconds };
    }

    return { success: true, retryAfter: 0 };
  } catch (error) {
    console.error("Rate limit error:", error);
    // Redis errored mid-operation: fail closed via the local fallback
    // rather than letting the request through unconditionally.
    return localRateLimit(fullKey, limit, windowSeconds);
  }
}

export function getRequestIp(req: NextRequest): string {
  return getClientIp(req);
}

export async function rateLimit(
  req: NextRequest,
  config: RateLimitConfig
): Promise<{ success: true; response?: undefined } | { success: false; response: NextResponse }> {
  const { limit, window: windowSeconds, type } = config;
  const ip = getClientIp(req);

  const result = await checkRateLimitKey(`${type}:${ip}`, limit, windowSeconds);

  if (!result.success) {
    return { success: false, response: tooManyRequestsResponse(limit, result.retryAfter) };
  }

  return { success: true };
}
