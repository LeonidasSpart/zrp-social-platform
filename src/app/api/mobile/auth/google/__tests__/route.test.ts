import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mirrors login.test.ts's own approach: mock the two real boundaries
// (Google's own token verification, and findOrCreateOAuthUser's DB
// access) rather than hitting a live database or Google's servers.
// vi.hoisted is required (not a plain top-level const) because vi.mock
// factories are hoisted above all other code in this file.
const { verifyIdToken, findOrCreateOAuthUser } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findOrCreateOAuthUser: vi.fn(),
}));

vi.mock("google-auth-library", () => ({
  OAuth2Client: vi.fn().mockImplementation(function (this: { verifyIdToken: typeof verifyIdToken }) {
    this.verifyIdToken = verifyIdToken;
  }),
}));

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, findOrCreateOAuthUser };
});

vi.mock("next-auth/jwt", () => ({
  encode: vi.fn(async () => "encoded.jwt.token"),
}));

import { POST } from "../route";
import { encode } from "next-auth/jwt";
import type { NextResponse } from "next/server";

const mockedEncode = vi.mocked(encode);

function req(body: unknown) {
  return new NextRequest("https://zrp.one/api/mobile/auth/google", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

// rateLimit()'s return type allows `response` to be undefined even
// though every real code path here returns a NextResponse - see
// link-preview's own route.test.ts for the same pattern.
async function callPOST(request: NextRequest): Promise<NextResponse> {
  const res = await POST(request);
  if (!res) throw new Error("POST returned undefined - route always returns a NextResponse");
  return res;
}

function payload(overrides: Partial<{ email: string; email_verified: boolean; name: string; picture: string }> = {}) {
  return {
    email: "leo@zrp.one",
    email_verified: true,
    name: "Leo",
    picture: "https://example.com/avatar.jpg",
    ...overrides,
  };
}

const EXISTING_USER = {
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

const NEW_USER = {
  ...EXISTING_USER,
  id: "user_2",
  email: "brandnew@zrp.one",
  username: "brandnew_a1b2",
  onboardingCompleted: false,
};

describe("POST /api/mobile/auth/google", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
    findOrCreateOAuthUser.mockReset();
    mockedEncode.mockClear();
    process.env.NEXTAUTH_SECRET = "test-secret";
    process.env.NEXTAUTH_URL = "https://zrp.one";
    process.env.GOOGLE_CLIENT_ID = "test-web-client-id";
    process.env.GOOGLE_MOBILE_CLIENT_ID = "test-mobile-client-id";
  });

  it("400s when idToken is missing", async () => {
    const res = await callPOST(req({}));
    expect(res.status).toBe(400);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("400s on an unparseable body", async () => {
    const badReq = new NextRequest("https://zrp.one/api/mobile/auth/google", {
      method: "POST",
      body: "not json",
    });
    const res = await callPOST(badReq);
    expect(res.status).toBe(400);
  });

  // Scenario: existing user signs in with Google (an account that
  // already exists, whether created via email/password or web's own
  // Google login) - findOrCreateOAuthUser links by email rather than
  // creating a duplicate account, matching NextAuth's own signIn
  // callback exactly.
  it("logs in an existing account by email without creating a duplicate", async () => {
    verifyIdToken.mockResolvedValueOnce({ getPayload: () => payload() });
    findOrCreateOAuthUser.mockResolvedValueOnce(EXISTING_USER);

    const res = await callPOST(req({ idToken: "valid.token" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.id).toBe("user_1");
    expect(body.user.username).toBe("leo");
    expect(findOrCreateOAuthUser).toHaveBeenCalledWith("leo@zrp.one", "Leo", "https://example.com/avatar.jpg");
  });

  // Scenario: brand-new user - no existing account for this email,
  // findOrCreateOAuthUser creates one and the response's own
  // onboardingCompleted:false is what the client uses to route into
  // the onboarding flow instead of straight to Home.
  it("creates a new account for a first-time Google sign-in and flags onboarding as incomplete", async () => {
    verifyIdToken.mockResolvedValueOnce({ getPayload: () => payload({ email: "brandnew@zrp.one" }) });
    findOrCreateOAuthUser.mockResolvedValueOnce(NEW_USER);

    const res = await callPOST(req({ idToken: "valid.token" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.id).toBe("user_2");
    expect(body.user.onboardingCompleted).toBe(false);
  });

  // Scenario: failed auth - Google's own token verification throws
  // (expired, tampered, wrong audience). Must not leak which part of
  // verification failed, and must never reach findOrCreateOAuthUser.
  it("401s when Google's own ID token verification fails", async () => {
    verifyIdToken.mockRejectedValueOnce(new Error("Token used too late"));
    const res = await callPOST(req({ idToken: "expired.token" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid Google sign-in token");
    expect(findOrCreateOAuthUser).not.toHaveBeenCalled();
  });

  // Regression: the catch around verifyIdToken used to swallow the real
  // failure reason entirely, so "Invalid Google sign-in token" covered
  // everything from a genuine audience mismatch to a network failure
  // reaching Google, with nothing in Railway's own logs to tell them
  // apart. The response body must stay generic (never leak verification
  // internals to the client), but the server's own log now names the
  // real reason.
  it("logs the real verification failure reason server-side without changing the generic client response", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    verifyIdToken.mockRejectedValueOnce(
      new Error("Wrong recipient, payload audience != requested audience")
    );

    const res = await callPOST(req({ idToken: "mismatched-audience.token" }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid Google sign-in token");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("ID token verification failed"),
      expect.stringContaining("Wrong recipient")
    );
    errorSpy.mockRestore();
  });

  // Scenario: invalid token - a token that verifies structurally but
  // carries no usable identity (missing/unverified email). Credential
  // Manager itself can hand back a token shaped like this if the
  // underlying Google account's email was never verified.
  it("401s when the verified token has no email or an unverified email", async () => {
    verifyIdToken.mockResolvedValueOnce({ getPayload: () => payload({ email_verified: false }) });
    const res = await callPOST(req({ idToken: "unverified-email.token" }));
    expect(res.status).toBe(401);
    expect(findOrCreateOAuthUser).not.toHaveBeenCalled();
  });

  // Scenario: cancelled - this is a Credential Manager-level UI
  // cancellation (GetCredentialCancellationException in GoogleAuth.kt),
  // which never reaches this endpoint at all - the request body never
  // gets sent because there is no token to send. Documented here
  // rather than tested at this layer, since there is nothing for the
  // route to receive.

  // Scenario: already linked - the same Google account signs in twice
  // in a row. findOrCreateOAuthUser's own find-by-email path (not a
  // separate "already linked" branch) makes the second call identical
  // to the first: same user returned, no duplicate created, no error.
  it("signing in twice with the same Google account returns the same linked user both times", async () => {
    verifyIdToken.mockResolvedValue({ getPayload: () => payload() });
    findOrCreateOAuthUser.mockResolvedValue(EXISTING_USER);

    const first = await callPOST(req({ idToken: "valid.token" }));
    const second = await callPOST(req({ idToken: "valid.token.2" }));

    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(firstBody.user.id).toBe(secondBody.user.id);
    expect(findOrCreateOAuthUser).toHaveBeenCalledTimes(2);
  });

  // Scenario: session creation - a successful sign-in must mint the
  // exact same NextAuth-compatible token shape /mobile/auth/login
  // produces (see that route's own login.test.ts), since every one of
  // the app's other 217 routes trusts this cookie shape regardless of
  // which login method created it.
  it("mints a real NextAuth-compatible session token on success", async () => {
    verifyIdToken.mockResolvedValueOnce({ getPayload: () => payload() });
    findOrCreateOAuthUser.mockResolvedValueOnce(EXISTING_USER);

    const res = await callPOST(req({ idToken: "valid.token" }));
    const body = await res.json();
    expect(body.sessionToken).toBe("encoded.jwt.token");
    expect(body.cookieName).toBe("__Secure-next-auth.session-token");
    expect(body.expiresInSeconds).toBe(30 * 24 * 60 * 60);
    expect(mockedEncode).toHaveBeenCalledWith(
      expect.objectContaining({
        token: expect.objectContaining({ id: "user_1", username: "leo", plan: "free" }),
        secret: "test-secret",
        maxAge: 30 * 24 * 60 * 60,
      })
    );
  });

  // Scenario: logout then re-login - a banned/suspended account (which
  // is what a logged-out, deactivated user looks like server-side)
  // must be rejected on the next Google sign-in attempt rather than
  // silently issuing a session for a suspended account.
  it("403s a suspended account on re-login instead of issuing a session", async () => {
    verifyIdToken.mockResolvedValueOnce({ getPayload: () => payload() });
    findOrCreateOAuthUser.mockResolvedValueOnce(null);

    const res = await callPOST(req({ idToken: "valid.token" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("This account has been suspended");
    expect(mockedEncode).not.toHaveBeenCalled();
  });

  it("500s with no details when neither GOOGLE_CLIENT_ID nor GOOGLE_MOBILE_CLIENT_ID is configured", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_MOBILE_CLIENT_ID;
    const res = await callPOST(req({ idToken: "valid.token" }));
    expect(res.status).toBe(500);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  // Android's Credential Manager mints tokens whose `aud` claim is
  // GOOGLE_MOBILE_CLIENT_ID (a separate Web OAuth client, created in
  // the same Google Cloud project as the app's own registered Android
  // clients - see this route's own comment on why it can't reuse web's
  // GOOGLE_CLIENT_ID, which lives in a different project). Sign-in must
  // succeed even if GOOGLE_CLIENT_ID were ever unset, since the two are
  // independent, and the real google-auth-library call must be given
  // both as acceptable audiences, not just web's.
  it("accepts a token whether it was verified against the web or the mobile client ID", async () => {
    verifyIdToken.mockResolvedValueOnce({ getPayload: () => payload() });
    findOrCreateOAuthUser.mockResolvedValueOnce(EXISTING_USER);

    const res = await callPOST(req({ idToken: "valid.token" }));
    expect(res.status).toBe(200);
    expect(verifyIdToken).toHaveBeenCalledWith(
      expect.objectContaining({
        idToken: "valid.token",
        audience: ["test-web-client-id", "test-mobile-client-id"],
      })
    );
  });

  it("still works with only GOOGLE_MOBILE_CLIENT_ID configured (GOOGLE_CLIENT_ID unset)", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    verifyIdToken.mockResolvedValueOnce({ getPayload: () => payload() });
    findOrCreateOAuthUser.mockResolvedValueOnce(EXISTING_USER);

    const res = await callPOST(req({ idToken: "valid.token" }));
    expect(res.status).toBe(200);
    expect(verifyIdToken).toHaveBeenCalledWith(
      expect.objectContaining({ audience: ["test-mobile-client-id"] })
    );
  });
});
