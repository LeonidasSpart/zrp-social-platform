import { getRedisClient } from "@/lib/redis";

/*
 * ============================================================
 * Pipeline mutual exclusion
 * ============================================================
 *
 * Two pipeline cycles running at once is the failure mode that turns
 * this system into a spam cannon, so it is guarded twice over:
 *
 *  1. This advisory lock (Redis SET NX PX), which stops a second run
 *     from even starting.
 *  2. The UNIQUE constraint on NewsPublication.idempotencyKey, which
 *     stops a second run from *doing* anything if it somehow starts.
 *
 * When Redis is unavailable the lock cannot be acquired and the cycle
 * does not run. That is deliberate: the ZRP rate limiter is allowed to
 * degrade to a per-instance fallback because failing open there costs a
 * few extra requests, whereas failing open here costs duplicate posts
 * on a public feed. Skipping a cycle costs nothing - the next one picks
 * up the same stories.
 */

const LOCK_KEY = "news:pipeline:lock";

export interface PipelineLock {
  release: () => Promise<void>;
}

export async function acquirePipelineLock(ttlSeconds: number): Promise<PipelineLock | null> {
  const redis = await getRedisClient();
  if (!redis) return null;

  try {
    const result = await redis.set(LOCK_KEY, String(Date.now()), {
      NX: true,
      PX: ttlSeconds * 1000,
    });

    if (result !== "OK") return null;

    return {
      release: async () => {
        try {
          await redis.del(LOCK_KEY);
        } catch (error) {
          // The TTL expires the lock anyway; a failed release delays the
          // next cycle at worst, it never duplicates one.
          console.error("ZRP News: failed to release pipeline lock", error);
        }
      },
    };
  } catch (error) {
    console.error("ZRP News: failed to acquire pipeline lock", error);
    return null;
  }
}
