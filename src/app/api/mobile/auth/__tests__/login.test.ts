import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { CredentialsAuthError } from "@/lib/auth";

// verifyCredentials itself (rate limiting, bcrypt, Prisma lookups) is
// exercised through the website's own login flow already - this
// route's own job is just: call verifyCredentials, and turn a success
// or CredentialsAuthError into the right HTTP response and NextAuth-
// compatible token. Mock verifyCredentials directly so this test
// doesn't need a live database. vi.hoisted is required here (not a
// plain top-level const) because vi.mock factories are hoisted above
// all other code in the file, including normal variable declarations.
const { verifyCredentials } = vi.hoisted(() => ({ verifyCredentials: vi.fn() }));

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, verifyCredentials };
});

vi.mock("next-auth/jwt", () => ({
  encode: vi.fn(async () => "encoded.jwt.token"),
}));

import { POST } from "../login/route";
import { encode } from "next-auth/jwt";

const mockedEncode = vi.mocked(encode);

function req(body: unknown) {
  return new NextRequest("https://zrp.one/api/mobile/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const REAL_USER = {
  id: "user_1",
  email: "leo@zrp.one",
  name: "Leo",
  username: "leo",
  isAdmin: false,
  role: "USER" as const,
  badgeType: null,
  avatarUrl: null,
  onboardingCompleted: true,
  banned: false,
  emailVerified: true,
  plan: "free",
};

describe("POST /api/mobile/auth/login", () => {
  beforeEach(() => {
    verifyCredentials.mockReset();
    mockedEncode.mockClear();
    process.env.NEXTAUTH_SECRET = "test-secret";
    process.env.NEXTAUTH_URL = "https://zrp.one";
  });

  it("400s when identifier or password is missing", async () => {
    const res = await POST(req({ identifier: "leo" }));
    expect(res.status).toBe(400);
    expect(verifyCredentials).not.toHaveBeenCalled();
  });

  it("400s on an unparseable body", async () => {
    const badReq = new NextRequest("https://zrp.one/api/mobile/auth/login", {
      method: "POST",
      body: "not json",
    });
    const res = await POST(badReq);
    expect(res.status).toBe(400);
  });

  it("returns the CredentialsAuthError's own status and message on invalid credentials", async () => {
    verifyCredentials.mockRejectedValueOnce(new CredentialsAuthError("Invalid credentials", 401));
    const res = await POST(req({ identifier: "leo", password: "wrong" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid credentials");
  });

  it("returns 429 when verifyCredentials reports rate limiting", async () => {
    verifyCredentials.mockRejectedValueOnce(
      new CredentialsAuthError("Too many login attempts. Please try again later.", 429)
    );
    const res = await POST(req({ identifier: "leo", password: "x" }));
    expect(res.status).toBe(429);
  });

  it("mints a session token and returns real user fields on success", async () => {
    verifyCredentials.mockResolvedValueOnce(REAL_USER);
    const res = await POST(req({ identifier: "leo", password: "correct" }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.sessionToken).toBe("encoded.jwt.token");
    expect(body.cookieName).toBe("__Secure-next-auth.session-token");
    expect(body.user.username).toBe("leo");
    expect(body.user.id).toBe("user_1");

    // The encoded token payload must carry real, non-fabricated user
    // data matching what the website's own jwt() callback would embed.
    expect(mockedEncode).toHaveBeenCalledWith(
      expect.objectContaining({
        token: expect.objectContaining({ id: "user_1", username: "leo", plan: "free" }),
        secret: "test-secret",
        maxAge: 30 * 24 * 60 * 60,
      })
    );
  });

  it("uses the non-secure cookie name when NEXTAUTH_URL isn't https", async () => {
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    verifyCredentials.mockResolvedValueOnce(REAL_USER);
    const res = await POST(req({ identifier: "leo", password: "correct" }));
    const body = await res.json();
    expect(body.cookieName).toBe("next-auth.session-token");
  });
});
