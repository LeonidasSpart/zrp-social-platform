/*
 * Boot-time migration-safety check (CommonJS - required by server.js,
 * the bare Node entrypoint; src/lib/migrations-check.ts re-exports it
 * with types for the test suite).
 *
 * ⚠️ RELIABILITY: railway.json's preDeployCommand (`npx prisma migrate
 * deploy`) is supposed to apply every pending migration before a new
 * release ever receives traffic - but that's an external deploy-
 * orchestration guarantee this process has no way to verify on its
 * own. When it silently didn't happen in production (a release went
 * live with code expecting User.credentialsVersion before that
 * column's migration had actually run), the failure mode was
 * catastrophic and silent: every authenticated request threw
 * PrismaClientKnownRequestError P2022 and login was down for everyone,
 * with nothing short-circuiting it before the first real user hit it.
 * This compares the migrations committed in prisma/migrations against
 * what Postgres's own _prisma_migrations table says has actually
 * finished, and refuses to start - rather than start and serve broken
 * auth to every request - if any are missing.
 *
 * A transient connection failure while reaching Postgres (a dropped or
 * timed-out connection - e.g. "Connection terminated unexpectedly",
 * seen in production when the DB was briefly unreachable moments
 * after `prisma migrate deploy` had just succeeded against the same
 * database) is NOT the same failure this check exists to catch: the
 * table/schema genuinely missing. Treating every query failure as
 * fatal turned a brief network blip into a hard crash loop - and each
 * failed attempt exited via process.exit() without disconnecting
 * first, leaving its connection-pool sockets for Postgres's own
 * idle-reaper to clean up instead of releasing them immediately, so a
 * transient blip could compound into real connection pressure the
 * longer the loop ran. A few retries with a short delay rides out
 * exactly that kind of blip; a genuinely missing table or schema fails
 * identically on every attempt and still reports FATAL and exits once
 * the budget is spent.
 */

const fs = require("fs");
const path = require("path");

const MIGRATIONS_CHECK_MAX_ATTEMPTS = 5;
const MIGRATIONS_CHECK_RETRY_DELAY_MS = 1500;

function listMigrationsOnDisk(migrationsDir) {
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/** Exported standalone so a test can exercise the retry/backoff behavior directly. */
async function fetchAppliedMigrationsWithRetry(prisma, options) {
  const maxAttempts = (options && options.maxAttempts) || MIGRATIONS_CHECK_MAX_ATTEMPTS;
  const retryDelayMs = options && options.retryDelayMs != null ? options.retryDelayMs : MIGRATIONS_CHECK_RETRY_DELAY_MS;
  const log = (options && options.log) || console;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$queryRaw`
        SELECT migration_name FROM "_prisma_migrations"
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      `;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      log.error(
        `⚠️  Could not reach Postgres to verify migrations (attempt ${attempt}/${maxAttempts}) - retrying in ${retryDelayMs}ms:`,
        err && err.message ? err.message : err
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}

/**
 * `options` are all optional and exist for testability: migrationsDir,
 * maxAttempts, retryDelayMs, log (defaults to console), and exit
 * (defaults to process.exit) - a test supplies fakes for all five so it
 * never touches the real filesystem, real timers, or actually kills the
 * test process.
 */
async function assertMigrationsApplied(prisma, options) {
  const migrationsDir = (options && options.migrationsDir) || path.join(__dirname, "prisma", "migrations");
  const exit = (options && options.exit) || ((code) => process.exit(code));
  const log = (options && options.log) || console;
  const maxAttempts = (options && options.maxAttempts) || MIGRATIONS_CHECK_MAX_ATTEMPTS;

  const onDisk = listMigrationsOnDisk(migrationsDir);
  if (onDisk.length === 0) return;

  let applied;
  try {
    applied = await fetchAppliedMigrationsWithRetry(prisma, { ...options, log });
  } catch (err) {
    log.error(
      `🔴 FATAL: could not read the _prisma_migrations table to verify the schema is up to date after ` +
        `${maxAttempts} attempts (the table may not exist yet, meaning no migration has EVER been applied ` +
        "to this database - or Postgres is genuinely unreachable). " +
        "Run `npx prisma migrate deploy` against this database, then restart.",
      err
    );
    await prisma.$disconnect().catch(() => {});
    exit(1);
    return;
  }

  const appliedNames = new Set(applied.map((row) => row.migration_name));
  const pending = onDisk.filter((name) => !appliedNames.has(name));

  if (pending.length > 0) {
    log.error(
      `🔴 FATAL: ${pending.length} migration(s) committed in prisma/migrations have NOT been applied ` +
        `to this database: ${pending.join(", ")}. The running code expects the schema these migrations ` +
        "produce and will error on nearly every request. Refusing to start. " +
        "Run `npx prisma migrate deploy` against this database, then restart."
    );
    await prisma.$disconnect().catch(() => {});
    exit(1);
  }
}

module.exports = {
  MIGRATIONS_CHECK_MAX_ATTEMPTS,
  MIGRATIONS_CHECK_RETRY_DELAY_MS,
  listMigrationsOnDisk,
  fetchAppliedMigrationsWithRetry,
  assertMigrationsApplied,
};
