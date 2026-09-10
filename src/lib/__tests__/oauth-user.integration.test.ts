import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { findOrCreateOAuthUser } from "@/lib/auth";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

// Regression coverage for the master directive's Priority 1: Google
// authentication must work correctly for both an existing user signing
// in and a brand-new user registering. findOrCreateOAuthUser is the
// single function both NextAuth's own signIn callback (website browser
// flow) and POST /api/mobile/auth/google (native Android) call - so
// testing it directly, against a real database rather than mocks,
// covers the actual account-linking/creation logic shared by every
// Google sign-in surface at once.
describe.skipIf(!hasRealDatabaseUrl)(
  "findOrCreateOAuthUser (integration, real Postgres)",
  () => {
    const userIds: string[] = [];
    const runId = randomUUID().slice(0, 8);

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    it("creates a new, pre-verified account for a first-time Google sign-in", async () => {
      const email = `newgoogle-${runId}@oauthtest.example`;
      const result = await findOrCreateOAuthUser(email, "New Googler", "https://example.com/avatar.jpg");
      expect(result).not.toBeNull();
      userIds.push(result!.id);

      expect(result!.email).toBe(email);
      expect(result!.onboardingCompleted).toBe(false);
      expect(result!.emailVerified).toBe(true);
      expect(result!.banned).toBe(false);

      const dbUser = await prisma.user.findUnique({ where: { id: result!.id } });
      expect(dbUser?.password).toBeNull();
      expect(dbUser?.avatarUrl).toBe("https://example.com/avatar.jpg");
      expect(dbUser?.emailVerified).not.toBeNull();
    });

    it("logs in an existing account by email without creating a duplicate", async () => {
      const email = `existinggoogle-${runId}@oauthtest.example`;
      const existing = await prisma.user.create({
        data: {
          email,
          username: `existinggoogle${runId}`.slice(0, 20),
          password: "x",
          role: "USER",
          name: "Existing User",
          emailVerified: new Date(),
        },
      });
      userIds.push(existing.id);

      const before = await prisma.user.count({ where: { email } });
      const result = await findOrCreateOAuthUser(email, "Existing User", null);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(existing.id);
      const after = await prisma.user.count({ where: { email } });
      expect(after).toBe(before);
    });

    it("matches an existing account case-insensitively, same as login's own lookup", async () => {
      const email = `mixedcasegoogle-${runId}@oauthtest.example`;
      const existing = await prisma.user.create({
        data: {
          email,
          username: `mixedcasegoogle${runId}`.slice(0, 20),
          password: "x",
          role: "USER",
        },
      });
      userIds.push(existing.id);

      const result = await findOrCreateOAuthUser(email.toUpperCase(), "Whoever", null);
      expect(result!.id).toBe(existing.id);
    });

    it("returns null for a banned account instead of issuing a session", async () => {
      const email = `bannedgoogle-${runId}@oauthtest.example`;
      const banned = await prisma.user.create({
        data: {
          email,
          username: `bannedgoogle${runId}`.slice(0, 20),
          password: "x",
          role: "USER",
          banned: true,
        },
      });
      userIds.push(banned.id);

      const result = await findOrCreateOAuthUser(email, "Banned User", null);
      expect(result).toBeNull();
    });

    it("assigns a unique username derived from the email for a new account", async () => {
      const email = `uniquehandle-${runId}@oauthtest.example`;
      const result = await findOrCreateOAuthUser(email, null, null);
      userIds.push(result!.id);

      expect(result!.username).toBeTruthy();
      expect(result!.username.startsWith("uniquehandle")).toBe(true);

      // A second, different email with the same local-part prefix must
      // not collide with the first account's generated username.
      const email2 = `uniquehandle-${runId}-2@oauthtest.example`;
      const result2 = await findOrCreateOAuthUser(email2, null, null);
      userIds.push(result2!.id);
      expect(result2!.username).not.toBe(result!.username);
    });
  }
);
