import type { PrismaClient } from "@prisma/client";

export const BCRYPT_ROUNDS: number;
export const LEGACY_WHERE: {
  password: { not: null };
  NOT: { password: { startsWith: string } };
};

export function isBcryptHash(value: string | null | undefined): boolean;

export function countLegacyPasswords(prisma: PrismaClient): Promise<number>;

export interface LegacyPasswordMigrationResult {
  mode: "dry-run" | "migrate";
  usersWithPassword: number;
  scanned: number;
  legacyPlaintextFound: number;
  migratedToBcrypt: number;
  skippedBecauseChangedMidRun: number;
}

export function migrateLegacyPasswords(
  prisma: PrismaClient,
  options?: { dryRun?: boolean; batchSize?: number }
): Promise<LegacyPasswordMigrationResult>;

export interface StartupMigrationOutcome {
  /** Legacy rows found before running; 0 = nothing to do; -1 = the check itself failed. */
  pending: number;
  result: LegacyPasswordMigrationResult | null;
}

export function runLegacyPasswordMigrationAtStartup(
  prisma: PrismaClient,
  log?: Pick<Console, "log" | "warn" | "error">
): Promise<StartupMigrationOutcome>;
