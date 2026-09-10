/*
 * READ-ONLY audit of accounts that differ only by email case (the
 * duplicates the pre-fix Google/Apple link step created). Prints a JSON
 * report of counts, categories and opaque account ids - never an email,
 * name, password hash or token. Performs no writes of any kind.
 *
 * Usage (needs DATABASE_URL, same as the app):
 *   npx tsx scripts/audit-oauth-duplicates.ts            # summary + per-group detail
 *   npx tsx scripts/audit-oauth-duplicates.ts --summary  # counts only
 */

import { auditOAuthDuplicates } from "../src/lib/oauth-duplicate-audit";
import { prisma } from "../src/lib/db";

async function main() {
  const summaryOnly = process.argv.includes("--summary");
  const report = await auditOAuthDuplicates();
  const output = summaryOnly ? { ...report, groups: undefined } : report;
  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
}

main()
  .catch((err) => {
    console.error("Audit failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
