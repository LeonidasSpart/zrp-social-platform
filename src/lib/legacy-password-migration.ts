/*
 * ============================================================
 * Legacy plaintext password migration
 * ============================================================
 *
 * The implementation lives in /legacy-passwords.js (CommonJS) so that
 * server.js - the bare Node production entrypoint - can run it
 * automatically at every boot; see runLegacyPasswordMigrationAtStartup
 * there for the full safety write-up (idempotent, cursor-batched,
 * conditional per-row UPDATE, never logs a password or hash, no schema
 * change, no deletes). This module re-exports it with types for the
 * test suite and the manual CLI in scripts/hash-legacy-passwords.ts.
 */

export {
  BCRYPT_ROUNDS,
  LEGACY_WHERE,
  isBcryptHash,
  countLegacyPasswords,
  migrateLegacyPasswords,
  runLegacyPasswordMigrationAtStartup,
} from "../../legacy-passwords";

export type {
  LegacyPasswordMigrationResult,
  StartupMigrationOutcome,
} from "../../legacy-passwords";
