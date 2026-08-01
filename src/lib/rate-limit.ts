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

export async function rateLimit(
  req: NextRequest,
  config: RateLimitConfig
): Promise<{ success: boolean; response?: NextResponse }> {
  const { limit, window: windowSeconds, type } = config;

  try {
    const redis = await getRedisClient();
    if (!redis) {
      // If Redis is unavailable, allow the request
      return { success: true };
    }

    const ip = getClientIp(req);
    const key = `rate-limit:${type}:${ip}`;

    const current = await redis.get(key);
    const count = current ? parseInt(current, 10) : 0;

    if (count === 0) {
      await redis.set(key, "1", { EX: windowSeconds });
      return { success: true };
    }

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
              "Retry-After": (ttl > 0 ? ttl : windowSeconds).toString(),
            },
          }
        ),
      };
    }

    await redis.incr(key);
    return { success: true };
  } catch (error) {
    console.error("Rate limit error:", error);
    // On any error, allow the request – never block
    return { success: true };
  }
}
