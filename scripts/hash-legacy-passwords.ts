/*
 * Migrate legacy plaintext passwords to bcrypt - one-time, idempotent,
 * production-safe. All of the logic (and its safety properties) lives
 * in src/lib/legacy-password-migration.ts; this is only the CLI.
 *
 * Usage (needs DATABASE_URL, same as the app):
 *   npx tsx scripts/hash-legacy-passwords.ts --dry-run   # count only
 *   npx tsx scripts/hash-legacy-passwords.ts             # migrate
 *
 * Prints counts only - never a password, never a hash.
 */

import { PrismaClient } from "@prisma/client";
import { migrateLegacyPasswords } from "../src/lib/legacy-password-migration";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

migrateLegacyPasswords(prisma, { dryRun })
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((err) => {
    // Never echo row contents - only the error type/message.
    console.error("hash-legacy-passwords failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
