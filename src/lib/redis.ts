import { createClient, RedisClientType } from "redis";

const redisUrl = process.env.REDIS_URL || process.env.REDIS_PUBLIC_URL;
let client: RedisClientType | null = null;
let clientError: Error | null = null;

// ─── Get or create Redis client ──────────────────────────────────────
export async function getRedisClient() {
  if (clientError) {
    // If we already failed, don't try again
    return null;
  }
  if (!redisUrl) {
    console.warn("⚠️ REDIS_URL not set – caching disabled");
    return null;
  }

  if (!client) {
    try {
      client = createClient({ url: redisUrl });
      client.on("error", (err) => {
        console.error("Redis client error:", err);
        clientError = err;
        client = null;
      });
      await client.connect();
      console.log("✅ Redis connected");
    } catch (err) {
      console.error("Failed to connect to Redis:", err);
      clientError = err as Error;
      return null;
    }
  }

  // Check if client is still healthy
  if (client && !client.isOpen) {
    try {
      await client.connect();
    } catch {
      client = null;
      return null;
    }
  }

  return client;
}

// ─── Caching helpers ──────────────────────────────────────────────────
export async function getCached<T>(key: string): Promise<T | null> {
  const redis = await getRedisClient();
  if (!redis) return null;
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export async function setCached(key: string, data: any, ttl = 60): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(data), { EX: ttl });
  } catch {
    // fail silently
  }
}

export async function invalidateCache(pattern: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(keys);
    }
  } catch {
    // fail silently
  }
}
