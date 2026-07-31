import { NextRequest, NextResponse } from "next/server";
import { getRedisClient } from "./redis";

export interface RateLimitConfig {
  limit: number;
  window: number;
  type: string;
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.headers.get("x-real-ip") || "127.0.0.1";
}

export async function rateLimit(
  req: NextRequest,
  config: RateLimitConfig
): Promise<{ success: boolean; response?: NextResponse }> {
  const { limit, window: windowSeconds, type } = config;

  const redis = await getRedisClient();
  if (!redis) {
    return { success: true }; // fail open
  }

  const ip = getClientIp(req);
  const key = `rate-limit:${type}:${ip}`;

  try {
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
              "X-RateLimit-Reset": (Math.floor(Date.now() / 1000) + (ttl > 0 ? ttl : windowSeconds)).toString(),
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
    return { success: true };
  }
}
