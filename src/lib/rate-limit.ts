import { NextRequest, NextResponse } from "next/server";
import { redis } from "./redis";

// ─── Configuration ──────────────────────────────────────────────────
export interface RateLimitConfig {
  /** Maximum number of requests allowed */
  limit: number;
  /** Time window in seconds */
  window: number;
  /** Rate limit identifier (e.g., "auth", "posts") */
  type: string;
}

// ─── Get client IP from request ────────────────────────────────────
function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.headers.get("x-real-ip") || "127.0.0.1";
}

// ─── Main rate limiter ─────────────────────────────────────────────
export async function rateLimit(
  req: NextRequest,
  config: RateLimitConfig
): Promise<{ success: boolean; response?: NextResponse }> {
  const { limit, window: windowSeconds, type } = config;

  // Skip rate limiting if Redis is not available
  if (!redis) {
    return { success: true };
  }

  const ip = getClientIp(req);
  const key = `rate-limit:${type}:${ip}`;

  try {
    // ─── Get current count ──────────────────────────────────────
    const current = await redis.get(key);
    const count = current ? parseInt(current, 10) : 0;

    // ─── Set TTL if first request ──────────────────────────────
    if (count === 0) {
      await redis.set(key, "1", "EX", windowSeconds);
      return {
        success: true,
      };
    }

    // ─── Check if limit exceeded ────────────────────────────────
    if (count >= limit) {
      const ttl = await redis.ttl(key);
      return {
        success: false,
        response: NextResponse.json(
          {
            error: "Too many requests. Please try again later.",
            retryAfter: ttl > 0 ? ttl : windowSeconds,
          },
          {
            status: 429,
            headers: {
              "X-RateLimit-Limit": limit.toString(),
              "X-RateLimit-Remaining": "0",
              "X-RateLimit-Reset": (Math.floor(Date.now() / 1000) + (ttl > 0 ? ttl : windowSeconds)).toString(),
              "Retry-After": (ttl > 0 ? ttl : windowSeconds).toString(),
            },
          }
        ),
      };
    }

    // ─── Increment counter ──────────────────────────────────────
    await redis.incr(key);

    const remaining = limit - count - 1;
    const ttl = await redis.ttl(key);

    return {
      success: true,
    };
  } catch (error) {
    console.error("Rate limit error:", error);
    // Fail open – allow request if Redis is down
    return { success: true };
  }
}
