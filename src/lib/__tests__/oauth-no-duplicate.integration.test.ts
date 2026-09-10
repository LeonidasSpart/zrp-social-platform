import { describe, it, expect, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { prisma } from "../db";
import { authOptions, findOrCreateOAuthUser } from "../auth";

// Google's own token verification is the one boundary not under test:
// the mobile route's real account-linking path (findOrCreateOAuthUser
// against a real Postgres) is exercised end to end.
const { verifyIdToken } = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));
vi.mock("google-auth-library", () => ({
  OAuth2Client: vi.fn().mockImplementation(function (this: { verifyIdToken: typeof verifyIdToken }) {
    this.verifyIdToken = verifyIdToken;
  }),
}));

import { POST as mobileGoogleLogin } from "@/app/api/mobile/auth/google/route";

// Proves the production bug can no longer recur: an existing user who
// signs in with Google - through the website's NextAuth callbacks or the
// native app's endpoint, with the address in any casing, repeatedly, or
// even concurrently - is linked to the ONE account they already have,
// and no second row ever appears.

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

describe.skipIf(!hasRealDatabaseUrl)("Google sign-in never creates a duplicate account", () => {
  const runId = randomUUID().slice(0, 8);
  const created: string[] = [];

  async function existingUser(email: string, withPassword = true) {
    const row = await prisma.user.create({
      data: {
        email,
        username: `g${randomUUID().slice(0, 12)}`,
        password: withPassword ? await bcrypt.hash("pw", 4) : null,
        role: "USER",
        emailVerified: new Date(),
        onboardingCompleted: true,
      },
    });
    created.push(row.id);
    return row;
  }

  async function rowsFor(email: string) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "User" WHERE lower("email") = lower(${email})
    `;
    return rows.map((r) => r.id);
  }

  afterAll(async () => {
    for (const email of [
      `Web.Link-${runId}@Example.com`,
      `lower.link-${runId}@example.com`,
      `Mobile.Link-${runId}@Example.com`,
      `Brand.New-${runId}@Example.com`,
      `race-${runId}@example.com`,
    ]) {
      const ids = await rowsFor(email);
      created.push(...ids);
    }
    await prisma.user.deleteMany({ where: { id: { in: created } } });
  });

  it("website flow: signIn + jwt callbacks link a mixed-case existing account", async () => {
    const email = `Web.Link-${runId}@Example.com`;
    const existing = await existingUser(email);
    const signIn = authOptions.callbacks!.signIn!;
    const jwt = authOptions.callbacks!.jwt!;

    for (const typed of [email.toLowerCase(), email, email.toUpperCase()]) {
      const allowed = await signIn({
        user: { id: "google-sub", email: typed, name: "Web", image: null },
        account: { provider: "google", type: "oauth", providerAccountId: "sub" },
      } as never);
      expect(allowed).toBe(true);

      const token = await jwt({
        token: {},
        user: { id: "google-sub", email: typed, name: "Web", image: null },
        account: { provider: "google", type: "oauth", providerAccountId: "sub" },
      } as never);
      expect(token.id).toBe(existing.id);
    }
    expect(await rowsFor(email)).toEqual([existing.id]);
  });

  it("website flow: an existing lowercase account is linked when Google reports a different casing", async () => {
    const email = `lower.link-${runId}@example.com`;
    const existing = await existingUser(email);
    const linked = await findOrCreateOAuthUser("Lower.Link-" + runId + "@Example.COM", "L", null);
    expect(linked?.id).toBe(existing.id);
    expect(await rowsFor(email)).toEqual([existing.id]);
  });

  it("native flow: /api/mobile/auth/google links the existing account, any casing, repeatedly", async () => {
    const email = `Mobile.Link-${runId}@Example.com`;
    const existing = await existingUser(email, false);
    process.env.NEXTAUTH_SECRET = "test-secret";
    process.env.GOOGLE_CLIENT_ID = "web-client";

    for (const typed of [email.toLowerCase(), email, email.toUpperCase(), email.toLowerCase()]) {
      verifyIdToken.mockResolvedValueOnce({
        getPayload: () => ({ email: typed, email_verified: true, name: "M", picture: null }),
      });
      const res = await mobileGoogleLogin(
        new NextRequest("https://zrp.one/api/mobile/auth/google", {
          method: "POST",
          body: JSON.stringify({ idToken: "x" }),
          headers: { "Content-Type": "application/json", "x-forwarded-for": `10.9.${runId.charCodeAt(0) % 200}.7` },
        })
      );
      if (!res) throw new Error("route returned no response");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.user.id).toBe(existing.id);
    }
    expect(await rowsFor(email)).toEqual([existing.id]);
  });

  it("a brand-new Google user gets exactly one account, stored lowercase, on repeated sign-ins", async () => {
    const email = `Brand.New-${runId}@Example.com`;
    const first = await findOrCreateOAuthUser(email, "New", null);
    const again = await findOrCreateOAuthUser(email.toLowerCase(), "New", null);
    const upper = await findOrCreateOAuthUser(email.toUpperCase(), "New", null);
    expect(first).not.toBeNull();
    expect(again?.id).toBe(first!.id);
    expect(upper?.id).toBe(first!.id);
    expect(await rowsFor(email)).toEqual([first!.id]);
    expect(first!.email).toBe(email.toLowerCase());
  });

  it("concurrent first sign-ins for the same new address still yield exactly one account", async () => {
    const email = `race-${runId}@example.com`;
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        findOrCreateOAuthUser(i % 2 ? email : email.toUpperCase(), "R", null)
      )
    );
    const ids = new Set(results.map((r) => r?.id));
    expect(ids.size).toBe(1);
    expect(await rowsFor(email)).toHaveLength(1);
  });
});
