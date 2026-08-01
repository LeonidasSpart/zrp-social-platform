import { createClient, RedisClientType } from "redis";

const redisUrl = process.env.REDIS_URL || process.env.REDIS_PUBLIC_URL;
let client: RedisClientType | null = null;
let clientError: Error | null = null;

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
