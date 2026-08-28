import { NextRequest, NextResponse } from "next/server";
import { getRedisClient } from "./redis";

export interface RateLimitConfig {
  limit: number;
  window: number;
  type: string;
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "127.0.0.1";
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

    const current = await redis.get(fullKey);
    const count = current ? parseInt(current, 10) : 0;

    if (count === 0) {
      await redis.set(fullKey, "1", { EX: windowSeconds });
      return { success: true, retryAfter: 0 };
    }

    if (count >= limit) {
      const ttl = await redis.ttl(fullKey);
      return { success: false, retryAfter: ttl > 0 ? ttl : windowSeconds };
    }

    await redis.incr(fullKey);
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
): Promise<{ success: boolean; response?: NextResponse }> {
  const { limit, window: windowSeconds, type } = config;
  const ip = getClientIp(req);

  const result = await checkRateLimitKey(`${type}:${ip}`, limit, windowSeconds);

  if (!result.success) {
    return { success: false, response: tooManyRequestsResponse(limit, result.retryAfter) };
  }

  return { success: true };
}
