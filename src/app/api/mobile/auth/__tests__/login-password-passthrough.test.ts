import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Registration and password reset hash the password exactly as typed.
// The mobile login route used to trim it before verification, so a
// password registered with a surrounding space could never verify from
// the app. It must be handed to verifyCredentials untouched; only the
// identifier is trimmed (a stray space around a username is never part
// of the username).

const { verifyCredentials } = vi.hoisted(() => ({ verifyCredentials: vi.fn() }));

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, verifyCredentials };
});

vi.mock("next-auth/jwt", () => ({
  encode: vi.fn(async () => "encoded.jwt.token"),
}));

import { POST } from "../login/route";

function req(body: unknown) {
  return new NextRequest("https://zrp.one/api/mobile/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/mobile/auth/login password handling", () => {
  beforeEach(() => {
    verifyCredentials.mockReset();
    process.env.NEXTAUTH_SECRET = "test-secret";
    process.env.NEXTAUTH_URL = "https://zrp.one";
  });

  it("passes the password to verifyCredentials exactly as typed, trimming only the identifier", async () => {
    verifyCredentials.mockResolvedValue({
      id: "u1",
      email: "leo@zrp.one",
      name: "Leo",
      username: "leo",
      isAdmin: false,
      role: "USER",
      badgeType: null,
      avatarUrl: null,
      onboardingCompleted: true,
      banned: false,
      emailVerified: true,
      plan: "free",
    });

    const res = await POST(req({ identifier: "  leo  ", password: " padded secret " }));
    expect(res.status).toBe(200);
    expect(verifyCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: "leo", password: " padded secret " })
    );
  });

  it("still rejects an empty password", async () => {
    const res = await POST(req({ identifier: "leo", password: "" }));
    expect(res.status).toBe(400);
    expect(verifyCredentials).not.toHaveBeenCalled();
  });
});
