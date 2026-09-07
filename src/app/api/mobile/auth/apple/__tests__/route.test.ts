import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// verifyAppleIdentityToken's own cryptographic correctness (JWKS
// verification, issuer/audience/expiry/nonce checks) is covered directly
// in src/lib/__tests__/apple-identity-token.test.ts. This route's own job
// - mirroring /api/mobile/auth/google - is: call the verifier, then turn
// success or failure into the right HTTP response and NextAuth-compatible
// session token, so that's mocked here the same way login.test.ts mocks
// verifyCredentials.
const { verifyAppleIdentityToken, findOrCreateOAuthUser } = vi.hoisted(() => ({
  verifyAppleIdentityToken: vi.fn(),
  findOrCreateOAuthUser: vi.fn(),
}));

vi.mock("@/lib/apple-identity-token", () => ({ verifyAppleIdentityToken }));
vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, findOrCreateOAuthUser };
});
vi.mock("next-auth/jwt", () => ({
  encode: vi.fn(async () => "encoded.jwt.token"),
}));

import { POST } from "../route";
import { encode } from "next-auth/jwt";

const mockedEncode = vi.mocked(encode);

function req(body: unknown) {
  return new NextRequest("https://zrp.one/api/mobile/auth/apple", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const REAL_USER = {
  id: "user_1",
  email: "private-relay@privaterelay.appleid.com",
  name: null,
  username: "appleuser",
  isAdmin: false,
  role: "USER" as const,
  badgeType: null,
  avatarUrl: null,
  onboardingCompleted: true,
  banned: false,
  emailVerified: true,
  plan: "free",
};

describe("POST /api/mobile/auth/apple", () => {
  beforeEach(() => {
    verifyAppleIdentityToken.mockReset();
    findOrCreateOAuthUser.mockReset();
    mockedEncode.mockClear();
    process.env.NEXTAUTH_SECRET = "test-secret";
    process.env.NEXTAUTH_URL = "https://zrp.one";
    process.env.APPLE_CLIENT_ID = "one.zrp.social.web";
    delete process.env.APPLE_MOBILE_CLIENT_ID; // exercise the "one.zrp.social" fallback
  });

  it("400s when identityToken is missing", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect(verifyAppleIdentityToken).not.toHaveBeenCalled();
  });

  it("400s on an unparseable body", async () => {
    const badReq = new NextRequest("https://zrp.one/api/mobile/auth/apple", {
      method: "POST",
      body: "not json",
    });
    const res = await POST(badReq);
    expect(res.status).toBe(400);
  });

  it("verifies against both the Services ID and the native bundle ID as accepted audiences", async () => {
    verifyAppleIdentityToken.mockResolvedValueOnce({
      sub: "apple-sub-1",
      email: REAL_USER.email,
      emailVerified: true,
      isPrivateEmail: true,
    });
    findOrCreateOAuthUser.mockResolvedValueOnce(REAL_USER);

    await POST(req({ identityToken: "a.b.c" }));

    expect(verifyAppleIdentityToken).toHaveBeenCalledWith("a.b.c", {
      audiences: ["one.zrp.social.web", "one.zrp.social"],
      nonce: undefined,
    });
  });

  it("401s when the identity token fails verification", async () => {
    verifyAppleIdentityToken.mockRejectedValueOnce(new Error("Invalid Apple identity token signature"));
    const res = await POST(req({ identityToken: "bad.token.here" }));
    expect(res.status).toBe(401);
    expect(findOrCreateOAuthUser).not.toHaveBeenCalled();
  });

  it("401s when the verified token carries no verified email", async () => {
    verifyAppleIdentityToken.mockResolvedValueOnce({
      sub: "apple-sub-1",
      email: null,
      emailVerified: false,
      isPrivateEmail: false,
    });
    const res = await POST(req({ identityToken: "a.b.c" }));
    expect(res.status).toBe(401);
    expect(findOrCreateOAuthUser).not.toHaveBeenCalled();
  });

  it("passes fullName through only when present, for first-time account creation", async () => {
    verifyAppleIdentityToken.mockResolvedValueOnce({
      sub: "apple-sub-1",
      email: REAL_USER.email,
      emailVerified: true,
      isPrivateEmail: true,
    });
    findOrCreateOAuthUser.mockResolvedValueOnce(REAL_USER);

    await POST(req({ identityToken: "a.b.c", fullName: "Ada Lovelace" }));
    expect(findOrCreateOAuthUser).toHaveBeenCalledWith(REAL_USER.email, "Ada Lovelace", null);
  });

  it("omits fullName (passes null) on a returning sign-in where Apple sends no name", async () => {
    verifyAppleIdentityToken.mockResolvedValueOnce({
      sub: "apple-sub-1",
      email: REAL_USER.email,
      emailVerified: true,
      isPrivateEmail: true,
    });
    findOrCreateOAuthUser.mockResolvedValueOnce(REAL_USER);

    await POST(req({ identityToken: "a.b.c" }));
    expect(findOrCreateOAuthUser).toHaveBeenCalledWith(REAL_USER.email, null, null);
  });

  it("403s when the resolved account has been suspended", async () => {
    verifyAppleIdentityToken.mockResolvedValueOnce({
      sub: "apple-sub-1",
      email: REAL_USER.email,
      emailVerified: true,
      isPrivateEmail: true,
    });
    findOrCreateOAuthUser.mockResolvedValueOnce(null);

    const res = await POST(req({ identityToken: "a.b.c" }));
    expect(res.status).toBe(403);
  });

  it("mints a session token and returns real user fields on success", async () => {
    verifyAppleIdentityToken.mockResolvedValueOnce({
      sub: "apple-sub-1",
      email: REAL_USER.email,
      emailVerified: true,
      isPrivateEmail: true,
    });
    findOrCreateOAuthUser.mockResolvedValueOnce(REAL_USER);

    const res = await POST(req({ identityToken: "a.b.c" }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.sessionToken).toBe("encoded.jwt.token");
    expect(body.cookieName).toBe("__Secure-next-auth.session-token");
    expect(body.user.username).toBe("appleuser");
    expect(body.user.id).toBe("user_1");

    expect(mockedEncode).toHaveBeenCalledWith(
      expect.objectContaining({
        token: expect.objectContaining({ id: "user_1", username: "appleuser", plan: "free" }),
        secret: "test-secret",
        maxAge: 30 * 24 * 60 * 60,
      })
    );
  });

  it("forwards an explicit APPLE_MOBILE_CLIENT_ID override instead of the one.zrp.social default", async () => {
    process.env.APPLE_MOBILE_CLIENT_ID = "one.zrp.social.custom";
    verifyAppleIdentityToken.mockResolvedValueOnce({
      sub: "apple-sub-1",
      email: REAL_USER.email,
      emailVerified: true,
      isPrivateEmail: true,
    });
    findOrCreateOAuthUser.mockResolvedValueOnce(REAL_USER);

    await POST(req({ identityToken: "a.b.c" }));
    expect(verifyAppleIdentityToken).toHaveBeenCalledWith(
      "a.b.c",
      expect.objectContaining({ audiences: ["one.zrp.social.web", "one.zrp.social.custom"] })
    );
  });

  it("uses the non-secure cookie name when NEXTAUTH_URL isn't https", async () => {
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    verifyAppleIdentityToken.mockResolvedValueOnce({
      sub: "apple-sub-1",
      email: REAL_USER.email,
      emailVerified: true,
      isPrivateEmail: true,
    });
    findOrCreateOAuthUser.mockResolvedValueOnce(REAL_USER);

    const res = await POST(req({ identityToken: "a.b.c" }));
    const body = await res.json();
    expect(body.cookieName).toBe("next-auth.session-token");
  });
});
