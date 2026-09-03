import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "../db";
import { findExistingSessionUser, ACCOUNT_NOT_FOUND_RESPONSE } from "../session-user";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

// Regression coverage for the "email verification opens onboarding but says
// 'User account no longer exists'" bug: a JWT session can still decode as
// authenticated after the User row it points to is gone (stale cookie,
// deleted account). This is the shared check every onboarding-lifecycle
// route relies on to detect that state instead of failing deeper inside a
// Prisma write or, worse, silently no-oping against no one.
describe.skipIf(!hasRealDatabaseUrl)(
  "findExistingSessionUser (integration, real Postgres)",
  () => {
    const runId = randomUUID().slice(0, 8);
    const userIds: string[] = [];

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    it("resolves a real user for a session pointing at an existing row", async () => {
      const user = await prisma.user.create({
        data: {
          email: `real-${runId}@sessiontest.example`,
          username: `real${runId}`.slice(0, 20),
          password: "x",
          role: "USER",
          emailVerified: new Date(),
        },
      });
      userIds.push(user.id);

      const result = await findExistingSessionUser(user.id);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(user.id);
    });

    it("returns null for a session pointing at a deleted user, reproducing the stale-session bug condition", async () => {
      const user = await prisma.user.create({
        data: {
          email: `deleted-${runId}@sessiontest.example`,
          username: `deleted${runId}`.slice(0, 20),
          password: "x",
          role: "USER",
          emailVerified: new Date(),
        },
      });

      // Simulate a session/JWT that still carries this user's id (as an
      // already-issued cookie would) after the underlying account is gone -
      // deleted directly here, standing in for the scheduled-deletion job
      // completing on a device that never cleared its session cookie.
      await prisma.user.delete({ where: { id: user.id } });

      const result = await findExistingSessionUser(user.id);
      expect(result).toBeNull();
    });

    it("returns null for a bare made-up id, never throwing", async () => {
      const result = await findExistingSessionUser(randomUUID());
      expect(result).toBeNull();
    });

    it("ACCOUNT_NOT_FOUND_RESPONSE carries a machine-readable code alongside the human-readable message", () => {
      expect(ACCOUNT_NOT_FOUND_RESPONSE.code).toBe("ACCOUNT_NOT_FOUND");
      expect(ACCOUNT_NOT_FOUND_RESPONSE.error).toBe(
        "User account no longer exists. Please sign in again."
      );
    });
  }
);
