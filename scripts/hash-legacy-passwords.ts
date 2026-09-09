/*
 * Manual runner for the legacy plaintext → bcrypt password migration.
 *
 * NOT required for deployment: server.js runs the same migration
 * automatically at every production boot (see
 * runLegacyPasswordMigrationAtStartup in /legacy-passwords.js). This CLI
 * exists for operators who want to inspect or pre-run it - for example
 * a --dry-run count before a deploy.
 *
 * Usage (needs DATABASE_URL, same as the app):
 *   npx tsx scripts/hash-legacy-passwords.ts --dry-run   # count only, zero writes
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
