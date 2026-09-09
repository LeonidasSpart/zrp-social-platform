import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";

/*
 * ============================================================
 * Legacy plaintext password migration
 * ============================================================
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
 *     touched, so it can be re-run at any time.
 *   - Batched with a cursor: no full-table lock, no giant transaction.
 *   - Optimistic: each UPDATE is conditioned on the password still
 *     being the exact value that was read, so a user who changes their
 *     password mid-run is never overwritten.
 *   - Never returns, prints or logs a password or a hash. Counts only.
 *   - No schema change, no destructive statement, no deletes.
 *
 * Run via scripts/hash-legacy-passwords.ts.
 */

export const BCRYPT_ROUNDS = 10;

export function isBcryptHash(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith("$2");
}

export interface LegacyPasswordMigrationResult {
  mode: "dry-run" | "migrate";
  usersWithPassword: number;
  scanned: number;
  legacyPlaintextFound: number;
  migratedToBcrypt: number;
  skippedBecauseChangedMidRun: number;
}

export async function migrateLegacyPasswords(
  prisma: PrismaClient,
  options: { dryRun?: boolean; batchSize?: number } = {}
): Promise<LegacyPasswordMigrationResult> {
  const dryRun = options.dryRun === true;
  const batchSize = options.batchSize && options.batchSize > 0 ? options.batchSize : 200;

  // `password: null` rows are OAuth-only accounts (Google/Apple) - they
  // have no password at all and are not legacy plaintext; skipped.
  const usersWithPassword = await prisma.user.count({ where: { password: { not: null } } });

  let scanned = 0;
  let legacyPlaintextFound = 0;
  let migratedToBcrypt = 0;
  let skippedBecauseChangedMidRun = 0;
  let cursor: string | undefined;

  for (;;) {
    const rows = await prisma.user.findMany({
      where: { password: { not: null } },
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
