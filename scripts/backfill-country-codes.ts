/*
 * One-off historical backfill: derives `User.countryCode` (the
 * normalized ISO 3166-1 alpha-2 mirror - see prisma/schema.prisma) from
 * the existing free-text `User.country` for every row where `country`
 * is set but `countryCode` is still null.
 *
 * Every write since this migration shipped already sets `countryCode`
 * itself (PUT /api/user via src/lib/geo/country.ts's
 * normalizeCountryInput()) - this script only catches up rows that had
 * a `country` value from before that normalization existed.
 *
 * Never guesses: normalizeCountryInput() only ever returns a code for
 * an exact (case/diacritic-insensitive) match against a known ISO code,
 * official name, or listed alias (see docs/user-geography-and-acquisition.md
 * Section 4). A `country` value it cannot confidently resolve - a typo,
 * a city name, free-form text - is left as countryCode: null rather than
 * a wrong or partial match; this script logs those rows so they can be
 * reviewed, but does not touch them. Idempotent: only ever selects rows
 * where countryCode is still null, so re-running after some rows were
 * fixed by hand (or by the user re-saving their profile) is safe.
 *
 * Usage (needs DATABASE_URL, same as the app):
 *   npx tsx scripts/backfill-country-codes.ts --dry-run   # report only, zero writes
 *   npx tsx scripts/backfill-country-codes.ts             # apply
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { normalizeCountryInput } from "../src/lib/geo/country";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 }),
});

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const candidates = await prisma.user.findMany({
    where: { countryCode: null, country: { not: null } },
    select: { id: true, username: true, country: true },
  });

  console.log(`Found ${candidates.length} user(s) with a free-text country and no countryCode.`);

  let resolved = 0;
  let unresolved = 0;

  for (const user of candidates) {
    const code = normalizeCountryInput(user.country);

    if (!code) {
      unresolved++;
      console.log(`${dryRun ? "[dry-run] " : ""}user=${user.username} country=${JSON.stringify(user.country)} -> UNRESOLVED (left null)`);
      continue;
    }

    resolved++;
    console.log(`${dryRun ? "[dry-run] " : ""}user=${user.username} country=${JSON.stringify(user.country)} -> ${code}`);

    if (dryRun) continue;

    await prisma.user.update({
      where: { id: user.id },
      data: { countryCode: code },
    });
  }

  console.log(
    `${dryRun ? "[dry-run] would have" : "Backfilled"} ${resolved} of ${candidates.length} row(s); ` +
      `${unresolved} left unresolved (no confident match - see the log above).`
  );
}

main()
  .catch((err) => {
    console.error("backfill-country-codes failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
