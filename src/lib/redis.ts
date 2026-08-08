let client: any = null;
let clientError: Error | null = null;
let redisModule: typeof import("redis") | null = null;

// ─── Load Redis only at runtime ──────────────────────────────────────
async function loadRedis() {
  if (redisModule) {
    return redisModule;
  }

  try {
    redisModule = await import("redis");
    return redisModule;
  } catch (err) {
    console.error("Failed to load Redis module:", err);
    clientError = err as Error;
    return null;
  }
}

// ─── Get or create Redis client ──────────────────────────────────────
export async function getRedisClient() {
  if (clientError) {
    return null;
  }

  const redisUrl =
    process.env.REDIS_URL || process.env.REDIS_PUBLIC_URL;

  if (!redisUrl) {
    console.warn("⚠️ REDIS_URL not set – caching disabled");
    return null;
  }

  if (!client) {
    try {
      const redis = await loadRedis();

      if (!redis) {
        return null;
      }

      client = redis.createClient({
        url: redisUrl,
      });

      client.on("error", (err: Error) => {
        console.error("Redis client error:", err);
        clientError = err;
        client = null;
      });

      await client.connect();

      console.log("✅ Redis connected");
    } catch (err) {
      console.error("Failed to connect to Redis:", err);
      clientError = err as Error;
      client = null;
      return null;
    }
  }

  // ─── Check if client is still healthy ─────────────────────────────
  if (client && !client.isOpen) {
    try {
      await client.connect();
    } catch (err) {
      console.error("Failed to reconnect to Redis:", err);
      client = null;
      return null;
    }
  }

  return client;
}

// ─── Get cached value ────────────────────────────────────────────────
export async function getCached<T>(
  key: string
): Promise<T | null> {
  const redis = await getRedisClient();

  if (!redis) {
    return null;
  }

  try {
    const data = await redis.get(key);

    if (!data) {
      return null;
    }

    return JSON.parse(data) as T;
  } catch (err) {
    console.error("Redis get error:", err);
    return null;
  }
}

// ─── Set cached value ────────────────────────────────────────────────
export async function setCached(
  key: string,
  data: unknown,
  ttl = 60
): Promise<void> {
  const redis = await getRedisClient();

  if (!redis) {
    return;
  }

  try {
    await redis.set(
      key,
      JSON.stringify(data),
      {
        EX: ttl,
      }
    );
  } catch (err) {
    console.error("Redis set error:", err);
  }
}

// ─── Invalidate cache ────────────────────────────────────────────────
export async function invalidateCache(
  pattern: string
): Promise<void> {
  const redis = await getRedisClient();

  if (!redis) {
    return;
  }

  try {
    const keys = await redis.keys(pattern);

    if (keys.length > 0) {
      await redis.del(keys);
    }
  } catch (err) {
    console.error("Redis invalidate error:", err);
  }
}
