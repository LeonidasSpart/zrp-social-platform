import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../db";
import { migrateLegacyPasswords } from "../legacy-password-migration";
import { verifyCredentials } from "../auth";

// Distinct source IP per run so the login-ip limiter (shared Redis) never
// trips across repeated local runs.
const testIp = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

// The plaintext fallback in verifyCredentials is gone, and the offline
// migration that makes that safe hashes legacy rows in place without
// changing what the user has to type.
describe.skipIf(!hasRealDatabaseUrl)("legacy plaintext passwords (integration, real Postgres)", () => {
  const runId = randomUUID().slice(0, 8);
  const userIds: string[] = [];

  async function makeUser(suffix: string, password: string | null) {
    const user = await prisma.user.create({
      data: {
        email: `legacy-${suffix}-${runId}@sessiontest.example`,
        username: `lg${suffix}${runId}`.slice(0, 20),
        password,
        role: "USER",
        emailVerified: new Date(),
      },
    });
    userIds.push(user.id);
    return user;
  }

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("verifyCredentials no longer accepts a plaintext stored password (fallback removed)", async () => {
    const user = await makeUser("plain", "correct horse battery");
    await expect(
      verifyCredentials({ identifier: user.email!, password: "correct horse battery", ip: testIp })
    ).rejects.toMatchObject({ message: "Invalid credentials" });

    // And it did NOT silently "upgrade" the row on the way through.
    const after = await prisma.user.findUnique({ where: { id: user.id }, select: { password: true } });
    expect(after?.password).toBe("correct horse battery");
  });

  it("migrates plaintext rows to bcrypt of the same value, leaves bcrypt rows and OAuth-only rows alone, and is idempotent", async () => {
    const plain = await makeUser("mig", "s3cret-pass");
    const hashed = await makeUser("hash", await bcrypt.hash("already", 10));
    const oauth = await makeUser("oauth", null);
    const hashedBefore = (await prisma.user.findUnique({ where: { id: hashed.id }, select: { password: true } }))!.password;

    const dry = await migrateLegacyPasswords(prisma, { dryRun: true, batchSize: 2 });
    expect(dry.mode).toBe("dry-run");
    expect(dry.legacyPlaintextFound).toBeGreaterThanOrEqual(1);
    expect(dry.migratedToBcrypt).toBe(0);
    expect((await prisma.user.findUnique({ where: { id: plain.id }, select: { password: true } }))!.password).toBe("s3cret-pass");

    const run = await migrateLegacyPasswords(prisma, { batchSize: 2 });
    expect(run.migratedToBcrypt).toBeGreaterThanOrEqual(1);

    const migrated = (await prisma.user.findUnique({ where: { id: plain.id }, select: { password: true } }))!.password!;
    expect(migrated.startsWith("$2")).toBe(true);
    expect(await bcrypt.compare("s3cret-pass", migrated)).toBe(true);

    // Untouched rows.
    expect((await prisma.user.findUnique({ where: { id: hashed.id }, select: { password: true } }))!.password).toBe(hashedBefore);
    expect((await prisma.user.findUnique({ where: { id: oauth.id }, select: { password: true } }))!.password).toBeNull();

    // The user's existing password now works through the normal path.
    const ok = await verifyCredentials({ identifier: plain.email!, password: "s3cret-pass", ip: testIp });
    expect(ok.id).toBe(plain.id);

    // Second run: nothing left to do for this row.
    const again = await migrateLegacyPasswords(prisma);
    expect((await prisma.user.findUnique({ where: { id: plain.id }, select: { password: true } }))!.password).toBe(migrated);
    expect(again.skippedBecauseChangedMidRun).toBe(0);
  });
});
