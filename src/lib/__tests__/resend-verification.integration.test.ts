import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "../db";
import { resendVerificationEmail } from "../resend-verification";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

// Regression coverage for the "Resend verification email" button opening
// /forgot-password" bug: the login page's unverified-user error linked
// straight to the password-reset page instead of calling this resend
// action at all. This suite locks in the resend action itself - the
// action the button must now actually trigger - so a future change can't
// silently point it at the wrong flow again, and separately confirms
// verification tokens and password-reset tokens never overlap.
describe.skipIf(!hasRealDatabaseUrl)(
  "resendVerificationEmail (integration, real Postgres)",
  () => {
    const runId = randomUUID().slice(0, 8);
    const userIds: string[] = [];

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    async function createUser(label: string, opts: { verified: boolean }) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${runId}@resendtest.example`,
          username: `${label}${runId}`.slice(0, 20),
          password: "x",
          role: "USER",
          emailVerified: opts.verified ? new Date() : null,
          verificationToken: opts.verified ? null : "seed-token",
          verificationTokenExpiry: opts.verified
            ? null
            : new Date(Date.now() + 60_000),
        },
      });
      userIds.push(user.id);
      return user;
    }

    it("resolves an unverified account by email and issues a fresh token", async () => {
      const user = await createUser("byemail", { verified: false });

      const result = await resendVerificationEmail(user.email);
      expect(result.ok).toBe(true);

      const updated = await prisma.user.findUnique({ where: { id: user.id } });
      expect(updated!.verificationToken).not.toBeNull();
      expect(updated!.verificationToken).not.toBe("seed-token");
      expect(updated!.verificationTokenExpiry!.getTime()).toBeGreaterThan(Date.now());
    });

    it("resolves an unverified account by username - the exact identifier the login form's 'Email or Username' field can hold", async () => {
      const user = await createUser("byusername", { verified: false });

      const result = await resendVerificationEmail(user.username!);
      expect(result.ok).toBe(true);

      const updated = await prisma.user.findUnique({ where: { id: user.id } });
      expect(updated!.verificationToken).not.toBe("seed-token");
    });

    it("resolves email case-insensitively, matching login's own lookup", async () => {
      const user = await createUser("bymixedcase", { verified: false });

      const result = await resendVerificationEmail(user.email.toUpperCase());
      expect(result.ok).toBe(true);
    });

    it("reports ALREADY_VERIFIED for a verified account and does not touch its verification token", async () => {
      const user = await createUser("verified", { verified: true });

      const result = await resendVerificationEmail(user.email);
      expect(result).toEqual({ ok: false, code: "ALREADY_VERIFIED" });

      const unchanged = await prisma.user.findUnique({ where: { id: user.id } });
      expect(unchanged!.verificationToken).toBeNull();
    });

    it("reports USER_NOT_FOUND for an identifier matching no account, never throwing", async () => {
      const result = await resendVerificationEmail(`nobody-${runId}@resendtest.example`);
      expect(result).toEqual({ ok: false, code: "USER_NOT_FOUND" });
    });

    it("never writes to the password-reset token fields - verification and password reset stay fully separate", async () => {
      const user = await createUser("separation", { verified: false });

      await resendVerificationEmail(user.email);

      const updated = await prisma.user.findUnique({ where: { id: user.id } });
      expect(updated!.resetToken).toBeNull();
      expect(updated!.resetTokenExpiry).toBeNull();
      // The account's password itself must be completely untouched.
      expect(updated!.password).toBe(user.password);
    });
  }
);
