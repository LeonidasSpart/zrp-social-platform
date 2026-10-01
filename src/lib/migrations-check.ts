/*
 * ============================================================
 * Boot-time migration-safety check
 * ============================================================
 *
 * The implementation lives in /migrations-check.js (CommonJS) so that
 * server.js - the bare Node production entrypoint - can run it
 * automatically at every boot; see assertMigrationsApplied there for
 * the full safety write-up (refuses to start if the committed
 * migrations aren't all applied, retries a bounded number of times on
 * a transient connection failure before treating it as fatal). This
 * module re-exports it with types for the test suite.
 */

export {
  MIGRATIONS_CHECK_MAX_ATTEMPTS,
  MIGRATIONS_CHECK_RETRY_DELAY_MS,
  listMigrationsOnDisk,
  fetchAppliedMigrationsWithRetry,
  assertMigrationsApplied,
} from "../../migrations-check";
