import { randomUUID } from "crypto";
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

// Only delete the key if it still holds THIS acquisition's token. Without
// this check, an unconditional DEL is a classic unsafe-lock bug: if a
// cycle runs past its own TTL, the key expires and a second cycle can
// legitimately acquire a fresh lock in that window - the first cycle's
// eventual, delayed release() would then delete the SECOND cycle's still-
// active lock (not its own, already-expired one), letting a third cycle
// acquire immediately and run concurrently with the second. That is
// exactly the "two cycles running at once" failure this lock exists to
// prevent, reintroduced by an unsafe release. Comparing and deleting has
// to be one atomic step (a plain GET-then-DEL from this client has the
// same race between the two calls), hence the Lua script.
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

export interface PipelineLock {
  release: () => Promise<void>;
}

export async function acquirePipelineLock(ttlSeconds: number): Promise<PipelineLock | null> {
  const redis = await getRedisClient();
  if (!redis) return null;

  try {
    const token = randomUUID();
    const result = await redis.set(LOCK_KEY, token, {
      NX: true,
      PX: ttlSeconds * 1000,
    });

    if (result !== "OK") return null;

    return {
      release: async () => {
        try {
          await redis.eval(RELEASE_SCRIPT, { keys: [LOCK_KEY], arguments: [token] });
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
