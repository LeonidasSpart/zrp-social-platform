let client: any = null;

// Only a failure to *import* the redis package is permanent - the module
// is either installable in this runtime or it is not. Connection
// failures are deliberately NOT latched here; see getRedisClient().
let moduleLoadFailed = false;

let redisModule: typeof import("redis") | null = null;

// In-flight connection attempt, shared by every concurrent caller. Without
// this, a burst of simultaneous requests during a cold start each build
// their own client - a self-inflicted connection storm against a service
// that is, by definition, already under stress.
let connecting: Promise<unknown> | null = null;

// After a failed connection attempt, wait this long before trying again,
// so a Redis outage costs one attempt every few seconds rather than one
// per request.
const CONNECT_RETRY_COOLDOWN_MS = 5_000;
let lastConnectFailureAt = 0;

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
    moduleLoadFailed = true;
    return null;
  }
}

/**
 * True when the client exists and can actually accept commands.
 *
 * `isReady` is the right flag, not `isOpen`: node-redis keeps `isOpen`
 * true across a dropped connection while its own reconnect strategy
 * works in the background, and only `isReady` goes false for that
 * window. Measured directly against a real server behind a TCP proxy -
 * see __tests__/redis.integration.test.ts.
 */
function isUsable(candidate: any): boolean {
  if (!candidate) return false;
  return candidate.isReady !== undefined ? candidate.isReady : candidate.isOpen;
}

// ─── Get or create Redis client ──────────────────────────────────────
/**
 * Returns a usable Redis client, or null when Redis is unavailable.
 * Never throws.
 *
 * ⚠️ Previously a single connection error latched a module-level
 * `clientError` that nothing ever cleared, so one transient blip
 * disabled Redis for the entire lifetime of the process: rate limiting
 * silently fell back to its per-instance limiter forever, link-preview
 * caching stopped forever, and the ZRP News pipeline - which fails
 * closed when it cannot take its lock - stopped publishing until the
 * next deploy. The error handler also dropped the client reference on
 * every error, so each blip leaked the previous client, which kept
 * retrying in the background for the life of the process.
 *
 * node-redis reconnects on its own. The correct behaviour is therefore
 * to keep the one client, report "unavailable" only while it is not
 * ready, and let it heal - which it does, without a redeploy.
 */
export async function getRedisClient() {
  if (moduleLoadFailed) {
    return null;
  }

  const redisUrl =
    process.env.REDIS_URL || process.env.REDIS_PUBLIC_URL;

  if (!redisUrl) {
    console.warn("⚠️ REDIS_URL not set: caching disabled");
    return null;
  }

  if (client) {
    // Healthy, or healing under node-redis's own reconnect strategy. In
    // the healing case callers get null and fall back, and the very next
    // call after recovery gets a working client again.
    return isUsable(client) ? client : null;
  }

  if (connecting) {
    const pending = await connecting;
    return isUsable(pending) ? pending : null;
  }

  if (Date.now() - lastConnectFailureAt < CONNECT_RETRY_COOLDOWN_MS) {
    return null;
  }

  connecting = (async () => {
    const redis = await loadRedis();
    if (!redis) return null;

    const created = redis.createClient({ url: redisUrl });

    // Log and move on. Crucially this does NOT discard the client and
    // does NOT latch a permanent error - node-redis is already
    // reconnecting, and throwing the client away here is what leaked one
    // per blip.
    created.on("error", (err: Error) => {
      console.error("Redis client error:", err);
    });

    await created.connect();
    console.log("✅ Redis connected");
    return created;
  })();

  try {
    client = await connecting;
    return isUsable(client) ? client : null;
  } catch (err) {
    console.error("Failed to connect to Redis:", err);
    client = null;
    lastConnectFailureAt = Date.now();
    return null;
  } finally {
    connecting = null;
  }
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
