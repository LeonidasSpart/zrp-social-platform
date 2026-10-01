import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { assertMigrationsApplied, fetchAppliedMigrationsWithRetry, MIGRATIONS_CHECK_MAX_ATTEMPTS } from "../migrations-check";

/*
 * Regression coverage for a real production incident: a transient
 * Postgres connection failure ("Connection terminated unexpectedly")
 * moments after `prisma migrate deploy` had just succeeded against the
 * same database was treated identically to "the _prisma_migrations
 * table doesn't exist / no migration has ever run", calling
 * process.exit(1) immediately and crash-looping the whole app. These
 * tests exercise the real migrations directory on disk (no need to
 * mock fs for something this file doesn't own) against a fake Prisma
 * client, so the retry/backoff and exit/disconnect behavior is
 * verified without ever touching a real database or really exiting
 * the test process.
 */

const REAL_MIGRATIONS_DIR = path.join(__dirname, "..", "..", "..", "prisma", "migrations");

function realMigrationNames(): string[] {
  return fs
    .readdirSync(REAL_MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function fakePrisma(queryRaw: ReturnType<typeof vi.fn>) {
  return { $queryRaw: queryRaw, $disconnect: vi.fn().mockResolvedValue(undefined) } as any;
}

describe("assertMigrationsApplied", () => {
  let log: { log: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let exit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    log = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    exit = vi.fn();
  });

  it("resolves without exiting when every on-disk migration is already applied", async () => {
    const queryRaw = vi.fn().mockResolvedValue(realMigrationNames().map((name) => ({ migration_name: name })));
    const prisma = fakePrisma(queryRaw);

    await assertMigrationsApplied(prisma, { migrationsDir: REAL_MIGRATIONS_DIR, log, exit, retryDelayMs: 0 } as any);

    expect(exit).not.toHaveBeenCalled();
    expect(prisma.$disconnect).not.toHaveBeenCalled();
  });

  it("retries a transient connection failure and succeeds within budget, without exiting", async () => {
    const queryRaw = vi
      .fn()
      .mockRejectedValueOnce(new Error("Connection terminated unexpectedly"))
      .mockRejectedValueOnce(new Error("Connection terminated due to connection timeout"))
      .mockResolvedValueOnce(realMigrationNames().map((name) => ({ migration_name: name })));
    const prisma = fakePrisma(queryRaw);

    await assertMigrationsApplied(prisma, { migrationsDir: REAL_MIGRATIONS_DIR, log, exit, retryDelayMs: 0 } as any);

    expect(queryRaw).toHaveBeenCalledTimes(3);
    expect(exit).not.toHaveBeenCalled();
    // Each retry is logged, but never as the FATAL exit message.
    expect(log.error).toHaveBeenCalledTimes(2);
    expect(log.error.mock.calls.every((call) => !String(call[0]).includes("FATAL"))).toBe(true);
  });

  it("exits(1) and disconnects only after exhausting every retry attempt on a persistent connection failure - this is the exact production bug: a transient blip must never be treated as a one-shot fatal", async () => {
    const queryRaw = vi.fn().mockRejectedValue(new Error("Connection terminated unexpectedly"));
    const prisma = fakePrisma(queryRaw);

    await assertMigrationsApplied(prisma, { migrationsDir: REAL_MIGRATIONS_DIR, log, exit, retryDelayMs: 0 } as any);

    expect(queryRaw).toHaveBeenCalledTimes(MIGRATIONS_CHECK_MAX_ATTEMPTS);
    expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining("FATAL"), expect.anything());
  });

  it("exits(1) and disconnects when a migration committed on disk genuinely has not been applied", async () => {
    const onDisk = realMigrationNames();
    const missingOne = onDisk.slice(1); // pretend the first migration never ran
    const queryRaw = vi.fn().mockResolvedValue(missingOne.map((name) => ({ migration_name: name })));
    const prisma = fakePrisma(queryRaw);

    await assertMigrationsApplied(prisma, { migrationsDir: REAL_MIGRATIONS_DIR, log, exit, retryDelayMs: 0 } as any);

    expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining(onDisk[0]));
  });

  it("is a no-op when the migrations directory is empty (nothing committed yet)", async () => {
    const emptyDir = path.join(__dirname, "__fixtures-empty-migrations__");
    fs.mkdirSync(emptyDir, { recursive: true });
    try {
      const queryRaw = vi.fn();
      const prisma = fakePrisma(queryRaw);
      await assertMigrationsApplied(prisma, { migrationsDir: emptyDir, log, exit, retryDelayMs: 0 } as any);
      expect(queryRaw).not.toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();
    } finally {
      fs.rmdirSync(emptyDir);
    }
  });
});

describe("fetchAppliedMigrationsWithRetry", () => {
  it("propagates the final error once maxAttempts is exhausted", async () => {
    const queryRaw = vi.fn().mockRejectedValue(new Error("still down"));
    const prisma = { $queryRaw: queryRaw } as any;

    await expect(
      fetchAppliedMigrationsWithRetry(prisma, { maxAttempts: 3, retryDelayMs: 0, log: { error: vi.fn() } as any })
    ).rejects.toThrow("still down");
    expect(queryRaw).toHaveBeenCalledTimes(3);
  });
});
