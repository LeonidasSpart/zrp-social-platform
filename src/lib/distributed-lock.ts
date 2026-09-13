import { randomUUID } from "crypto";
import { getRedisClient } from "@/lib/redis";

/*
 * ============================================================
 * Generic Redis distributed lock
 * ============================================================
 *
 * Extracted from src/lib/news/lock.ts (which now wraps this) so a
 * second consumer - the withdrawal reconciliation job - doesn't grow
 * its own copy of the same SET-NX-PX-plus-token-scoped-Lua-release
 * pattern. Every lock acquired here shares the same correctness
 * properties:
 *
 *  - SET key value NX PX ttl is one atomic Redis command: acquisition
 *    can never race itself.
 *  - release() only deletes the key if it still holds THIS
 *    acquisition's own random token, via a Lua script (one atomic
 *    round trip - a plain GET-then-DEL from the client has a TOCTOU
 *    window between the two calls that a Lua EVAL does not). Without
 *    this, a lock held past its own TTL, then released late, could
 *    delete a DIFFERENT, later acquisition's still-active lock -
 *    letting two holders run concurrently, which is the exact failure
 *    every caller of this module uses a lock to prevent.
 *  - When Redis is unavailable, acquireLock() returns null rather than
 *    throwing or granting a fake lock. Every caller in this codebase
 *    is expected to fail closed (skip the protected work) rather than
 *    run it unprotected - see news/lock.ts's and the withdrawal
 *    reconciliation job's own comments for why that's the correct
 *    choice for what they each protect.
 */

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

export interface DistributedLock {
  release: () => Promise<void>;
}

export async function acquireLock(key: string, ttlSeconds: number): Promise<DistributedLock | null> {
  const redis = await getRedisClient();
  if (!redis) return null;

  try {
    const token = randomUUID();
    const result = await redis.set(key, token, {
      NX: true,
      PX: ttlSeconds * 1000,
    });

    if (result !== "OK") return null;

    return {
      release: async () => {
        try {
          await redis.eval(RELEASE_SCRIPT, { keys: [key], arguments: [token] });
        } catch (error) {
          // The TTL expires the lock anyway; a failed release delays
          // whatever's waiting on it at worst, it never lets two
          // holders run concurrently.
          console.error(`distributed-lock: failed to release "${key}"`, error);
        }
      },
    };
  } catch (error) {
    console.error(`distributed-lock: failed to acquire "${key}"`, error);
    return null;
  }
}
