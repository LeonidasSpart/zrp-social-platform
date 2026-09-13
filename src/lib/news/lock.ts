import { acquireLock, type DistributedLock } from "@/lib/distributed-lock";

/*
 * ============================================================
 * Pipeline mutual exclusion
 * ============================================================
 *
 * Two pipeline cycles running at once is the failure mode that turns
 * this system into a spam cannon, so it is guarded twice over:
 *
 *  1. This advisory lock (Redis SET NX PX, correctness properties
 *     documented in src/lib/distributed-lock.ts, which this wraps),
 *     which stops a second run from even starting.
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

export type PipelineLock = DistributedLock;

export async function acquirePipelineLock(ttlSeconds: number): Promise<PipelineLock | null> {
  return acquireLock(LOCK_KEY, ttlSeconds);
}
