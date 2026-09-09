/*
 * Legacy plaintext password migration (CommonJS - required by server.js,
 * the bare Node entrypoint, so the migration runs automatically at
 * every production boot; src/lib/legacy-password-migration.ts re-exports
 * it with types for the test suite and the manual CLI).
 *
 * ⚠️ SECURITY: src/lib/auth.ts used to accept a stored password that
 * wasn't a bcrypt hash by comparing it to the submitted password in
 * plain text, then hashing it on first successful login. That left the
 * real password of every account that hadn't logged in since sitting
 * in clear text in the database. That fallback is gone; this is the
 * migration that makes its removal safe: every non-bcrypt stored value
 * is replaced by the bcrypt hash OF THAT SAME VALUE, so the user's
 * existing password keeps working exactly as before. Nobody is locked
 * out, nobody is reset, nobody has to do anything.
 *
 * Safety properties:
 *   - Idempotent: rows already starting with "$2" (bcrypt) are never
 *     read for migration, so it can run on every boot at no cost once
 *     the data is clean (one COUNT, then nothing).
 *   - Batched with a cursor: no full-table lock, no giant transaction.
 *   - Optimistic: each UPDATE is conditioned on the password still
 *     being the exact value that was read, so a user who changes their
 *     password mid-run is never overwritten - and two instances booting
 *     at once can't double-hash a row (the second UPDATE simply matches
 *     nothing).
 *   - Never returns, prints or logs a password or a hash. Counts only.
 *   - No schema change, no destructive statement, no deletes.
 */

const bcrypt = require("bcryptjs");

const BCRYPT_ROUNDS = 10;
const DEFAULT_BATCH_SIZE = 200;

function isBcryptHash(value) {
  return typeof value === "string" && value.startsWith("$2");
}

// Rows that have a password but not a bcrypt one. This is the only
// filter every query below uses, so a clean database is one COUNT.
const LEGACY_WHERE = {
  password: { not: null },
  NOT: { password: { startsWith: "$2" } },
};

/** How many accounts still hold a non-bcrypt password. */
async function countLegacyPasswords(prisma) {
  return prisma.user.count({ where: LEGACY_WHERE });
}

async function migrateLegacyPasswords(prisma, options) {
  const dryRun = !!(options && options.dryRun);
  const batchSize =
    options && options.batchSize && options.batchSize > 0 ? options.batchSize : DEFAULT_BATCH_SIZE;

  // `password: null` rows are OAuth-only accounts (Google/Apple) - they
  // have no password at all and are not legacy plaintext; never touched.
  const usersWithPassword = await prisma.user.count({ where: { password: { not: null } } });

  let scanned = 0;
  let legacyPlaintextFound = 0;
  let migratedToBcrypt = 0;
  let skippedBecauseChangedMidRun = 0;
  let cursor;

  for (;;) {
    const rows = await prisma.user.findMany({
      where: LEGACY_WHERE,
      select: { id: true, password: true },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;
    scanned += rows.length;

    for (const row of rows) {
      const stored = row.password;
      if (!stored || isBcryptHash(stored)) continue;
      legacyPlaintextFound += 1;
      if (dryRun) continue;

      const hashed = await bcrypt.hash(stored, BCRYPT_ROUNDS);
      const result = await prisma.user.updateMany({
        where: { id: row.id, password: stored },
        data: { password: hashed },
      });
      if (result.count === 1) migratedToBcrypt += 1;
      else skippedBecauseChangedMidRun += 1;
    }
  }

  return {
    mode: dryRun ? "dry-run" : "migrate",
    usersWithPassword,
    scanned,
    legacyPlaintextFound,
    migratedToBcrypt,
    skippedBecauseChangedMidRun,
  };
}

/**
 * Boot-time runner for server.js. Counts first (cheap, no writes); only
 * if legacy rows exist does it run the migration, in the background so
 * the HTTP server is already listening and health checks pass. Returns
 * the promise so callers/tests can await it; server.js does not.
 */
async function runLegacyPasswordMigrationAtStartup(prisma, log) {
  const logger = log || console;
  try {
    const pending = await countLegacyPasswords(prisma);
    if (pending === 0) {
      logger.log("🔐 Legacy password check: no plaintext passwords remain.");
      return { pending: 0, result: null };
    }
    logger.warn(
      `🔐 Legacy password migration: ${pending} account(s) still hold a non-bcrypt password - hashing in place now.`
    );
    const result = await migrateLegacyPasswords(prisma);
    logger.log(
      `🔐 Legacy password migration finished: ${result.migratedToBcrypt} hashed, ${result.skippedBecauseChangedMidRun} skipped (changed mid-run).`
    );
    return { pending, result };
  } catch (err) {
    // Never echo row contents - only the error type/message. A failure
    // here must never take the server down; the next boot retries.
    logger.error(
      "🔐 Legacy password migration failed (will retry on next boot):",
      err instanceof Error ? err.message : err
    );
    return { pending: -1, result: null };
  }
}

module.exports = {
  BCRYPT_ROUNDS,
  LEGACY_WHERE,
  isBcryptHash,
  countLegacyPasswords,
  migrateLegacyPasswords,
  runLegacyPasswordMigrationAtStartup,
};
