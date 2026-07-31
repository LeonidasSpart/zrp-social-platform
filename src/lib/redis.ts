import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || process.env.REDIS_PUBLIC_URL;

if (!redisUrl) {
  console.warn("⚠️ REDIS_URL not set – caching disabled");
}

export const redis = redisUrl ? new Redis(redisUrl) : null;

export async function getCached<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export async function setCached(key: string, data: any, ttl = 60): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(data), "EX", ttl);
  } catch {
    // fail silently
  }
}

export async function invalidateCache(pattern: string): Promise<void> {
  if (!redis) return;
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // fail silently
  }
}
