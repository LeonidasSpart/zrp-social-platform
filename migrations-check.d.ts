import type { PrismaClient } from "@prisma/client";

export const MIGRATIONS_CHECK_MAX_ATTEMPTS: number;
export const MIGRATIONS_CHECK_RETRY_DELAY_MS: number;

export function listMigrationsOnDisk(migrationsDir: string): string[];

export interface MigrationsCheckOptions {
  migrationsDir?: string;
  maxAttempts?: number;
  retryDelayMs?: number;
  log?: Pick<Console, "log" | "warn" | "error">;
  exit?: (code: number) => void;
}

export function fetchAppliedMigrationsWithRetry(
  prisma: PrismaClient,
  options?: MigrationsCheckOptions
): Promise<Array<{ migration_name: string }>>;

export function assertMigrationsApplied(prisma: PrismaClient, options?: MigrationsCheckOptions): Promise<void>;
