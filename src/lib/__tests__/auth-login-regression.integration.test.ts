import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../db";
import { verifyCredentials, findOrCreateOAuthUser } from "../auth";
import { resendVerificationEmail } from "../resend-verification";

// Regression coverage for the production "users can no longer access
// their accounts" reports. Each case below is a legitimate account with
// a legitimate credential that the login path rejected. They run against
// a real Postgres because every one of them is about how a stored row is
// looked up, not about mocked behaviour.

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

// Distinct source IP per run so the login-ip limiter never trips across
// repeated local runs (see verifyCredentials).
function freshIp() {
  return `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(
    Math.random() * 255
  )}`;
}

describe.skipIf(!hasRealDatabaseUrl)("login regressions (integration, real Postgres)", () => {
  const runId = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const PASSWORD = "correct horse battery";

  async function makeUser(data: {
    email: string;
    username: string;
    password?: string | null;
  }) {
    const user = await prisma.user.create({
      data: {
        email: data.email,
        username: data.username,
        password: data.password === undefined ? await bcrypt.hash(PASSWORD, 10) : data.password,
        role: "USER",
        emailVerified: new Date(),
      },
    });
    userIds.push(user.id);
    return user;
  }

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    // findOrCreateOAuthUser may have created a stray lowercase duplicate
    // on the pre-fix code path; sweep anything from this run either way.
    await prisma.user.deleteMany({
      where: { email: { contains: runId, mode: "insensitive" } },
    });
  });

  // ─── Mixed-case stored email (legacy rows written before registration
  // normalized emails - see commit f85d193, which fixed the write path
  // only and documented that existing rows were NOT retroactively fixed).
  describe("account whose stored email has uppercase letters", () => {
    const storedEmail = () => `Mixed.Case-${runId}@Example.com`;

    it("can log in typing the email in lowercase", async () => {
      const user = await makeUser({ email: storedEmail(), username: `mc1${runId}`.slice(0, 20) });
      const result = await verifyCredentials({
        identifier: storedEmail().toLowerCase(),
        password: PASSWORD,
        ip: freshIp(),
      });
      expect(result.id).toBe(user.id);
    });

    it("can log in typing the email exactly as it was registered", async () => {
      const email = `Exact.Case-${runId}@Example.com`;
      const user = await makeUser({ email, username: `mc2${runId}`.slice(0, 20) });
      const result = await verifyCredentials({ identifier: email, password: PASSWORD, ip: freshIp() });
      expect(result.id).toBe(user.id);
    });

    it("Google sign-in links to the existing account instead of creating a duplicate", async () => {
      const email = `OAuth.Link-${runId}@Example.com`;
      const user = await makeUser({ email, username: `mc3${runId}`.slice(0, 20) });
      const linked = await findOrCreateOAuthUser(email.toLowerCase(), "Name", null);
      expect(linked?.id).toBe(user.id);
      const rows = await prisma.user.count({
        where: { email: { equals: email, mode: "insensitive" } },
      });
      expect(rows).toBe(1);
    });

    it("resend-verification resolves the account", async () => {
      const email = `Resend.Case-${runId}@Example.com`;
      const user = await prisma.user.create({
        data: {
          email,
          username: `mc4${runId}`.slice(0, 20),
          password: await bcrypt.hash(PASSWORD, 10),
          role: "USER",
          emailVerified: null,
        },
      });
      userIds.push(user.id);
      // Not sending real mail here: an unverified account resolving at
      // all is the regression - ALREADY_VERIFIED / ok both prove lookup.
      const result = await resendVerificationEmail(email.toLowerCase()).catch((e) => ({
        ok: false as const,
        code: String(e),
      }));
      expect(result).not.toMatchObject({ code: "USER_NOT_FOUND" });
    });
  });

  // ─── The case-tolerant lookup must be an equality, never a pattern:
  // Prisma's `mode: "insensitive"` is ILIKE on Postgres, where `%` and
  // `_` in the typed value are wildcards that would select accounts by
  // pattern. Verified to match arbitrary rows before this was written.
  describe("identifiers containing SQL LIKE metacharacters", () => {
    it("never resolve any account by pattern", async () => {
      const user = await makeUser({
        email: `Wild.Card-${runId}@Example.com`,
        username: `wildcard${runId}`.slice(0, 20),
      });
      const { findUserByIdentifier } = await import("../find-user");
      expect(await findUserByIdentifier("email", `%-${runId}@example.com`, { id: true })).toBeNull();
      expect(await findUserByIdentifier("email", `%@example.com`, { id: true })).toBeNull();
      expect(
        await findUserByIdentifier("email", `wild.card-${runId}@example.co_`, { id: true })
      ).toBeNull();
      expect(await findUserByIdentifier("username", `wildcard%`, { id: true })).toBeNull();
      expect(await findUserByIdentifier("username", `wildcard${runId}`.slice(0, 20).replace(/.$/, "_"), { id: true })).toBeNull();
      // ...while the real identifier, in any case, still resolves.
      expect((await findUserByIdentifier("email", `wild.card-${runId}@example.com`, { id: true }))?.id).toBe(
        user.id
      );
      await expect(
        verifyCredentials({ identifier: `%-${runId}@example.com`, password: PASSWORD, ip: freshIp() })
      ).rejects.toMatchObject({ status: 401 });
    });
  });

  // ─── Username case: registration enforces case-insensitive uniqueness
  // (findFirst ... mode: "insensitive"), so a username identifies exactly
  // one account regardless of case - login must resolve it the same way.
  describe("username typed in a different case than registered", () => {
    it("can log in with a lowercase username for a mixed-case registration", async () => {
      const user = await makeUser({
        email: `uname-${runId}@example.com`,
        username: `AlphaUser${runId}`.slice(0, 20),
      });
      const result = await verifyCredentials({
        identifier: user.username.toLowerCase(),
        password: PASSWORD,
        ip: freshIp(),
      });
      expect(result.id).toBe(user.id);
    });

    it("can log in with a capitalized username (mobile keyboards auto-capitalize)", async () => {
      const user = await makeUser({
        email: `uname2-${runId}@example.com`,
        username: `betauser${runId}`.slice(0, 20),
      });
      const typed = user.username.charAt(0).toUpperCase() + user.username.slice(1);
      const result = await verifyCredentials({ identifier: typed, password: PASSWORD, ip: freshIp() });
      expect(result.id).toBe(user.id);
    });
  });

  // ─── Passwords are hashed exactly as typed at registration and reset
  // (neither trims), so login must compare exactly as typed too.
  describe("password with surrounding whitespace", () => {
    it("accepts the password exactly as it was registered", async () => {
      const pw = "  padded secret  ";
      const user = await makeUser({
        email: `pad-${runId}@example.com`,
        username: `pad${runId}`.slice(0, 20),
        password: await bcrypt.hash(pw, 10),
      });
      const result = await verifyCredentials({ identifier: user.email, password: pw, ip: freshIp() });
      expect(result.id).toBe(user.id);
    });
  });

  // ─── Brute-force protection must count guesses, not logins: a user who
  // signs in on the website, the app and again after a logout is not an
  // attacker, and must never be told "Too many login attempts".
  describe("brute-force limiter", () => {
    it("does not lock an account out after repeated SUCCESSFUL logins", async () => {
      const user = await makeUser({
        email: `ok-${runId}@example.com`,
        username: `okuser${runId}`.slice(0, 20),
      });
      const ip = freshIp();
      for (let i = 0; i < 12; i++) {
        const result = await verifyCredentials({ identifier: user.email, password: PASSWORD, ip });
        expect(result.id).toBe(user.id);
      }
    });

    it("still locks an account after repeated FAILED guesses", async () => {
      const user = await makeUser({
        email: `bad-${runId}@example.com`,
        username: `baduser${runId}`.slice(0, 20),
      });
      const ip = freshIp();
      for (let i = 0; i < 8; i++) {
        await expect(
          verifyCredentials({ identifier: user.email, password: "wrong", ip })
        ).rejects.toMatchObject({ status: 401 });
      }
      await expect(
        verifyCredentials({ identifier: user.email, password: PASSWORD, ip })
      ).rejects.toMatchObject({ status: 429 });
    });

    it("still rejects a wrong password and an unknown account", async () => {
      const user = await makeUser({
        email: `neg-${runId}@example.com`,
        username: `neguser${runId}`.slice(0, 20),
      });
      await expect(
        verifyCredentials({ identifier: user.email, password: "nope", ip: freshIp() })
      ).rejects.toMatchObject({ message: "Invalid credentials", status: 401 });
      await expect(
        verifyCredentials({ identifier: `ghost-${runId}@example.com`, password: PASSWORD, ip: freshIp() })
      ).rejects.toMatchObject({ message: "Invalid credentials", status: 401 });
    });
  });
});
