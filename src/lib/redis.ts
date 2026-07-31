import { createClient, RedisClientType } from "redis";

const redisUrl = process.env.REDIS_URL || process.env.REDIS_PUBLIC_URL;

let client: RedisClientType | null = null;

export async function getRedisClient() {
  if (!redisUrl) {
    console.warn("⚠️ REDIS_URL not set – caching disabled");
    return null;
  }

  if (!client) {
    client = createClient({ url: redisUrl });
    client.on("error", (err) => console.error("Redis client error", err));
    await client.connect();
  }

  return client;
}

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
