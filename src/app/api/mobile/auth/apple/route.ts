import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { getFeatureStatus } from "@/lib/permissions";
import { findOrCreateOAuthUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { verifyAppleIdentityToken } from "@/lib/apple-identity-token";

// 30 days, matching NextAuth's own default session.maxAge and the same
// value /api/mobile/auth/login and /api/mobile/auth/google use.
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

function secureCookieName(): string {
  const secure =
    process.env.NEXTAUTH_URL?.startsWith("https://") ?? !!process.env.VERCEL;
  return secure ? "__Secure-next-auth.session-token" : "next-auth.session-token";
}

// Native Sign in with Apple (ASAuthorizationAppleIDCredential) hands the
// app an identityToken JWT directly - no browser redirect - the same
// shape of problem /api/mobile/auth/google already solves for Android's
// Credential Manager. This is that same route mirrored for Apple: verify
// the token against Apple's JWKS ourselves (src/lib/apple-identity-token),
// then hand account linking/creation to the exact same
// findOrCreateOAuthUser NextAuth's own web `signIn` callback uses, so an
// Apple sign-in resolves to the same account a user's Google or
// email/password login would. See ios-native/PARITY.md, "B2. Sign in with
// Apple (native)" for the full audit this closes.
//
// Two audiences are accepted because this app registers two different
// Apple client identities under one "Sign in with Apple" capability:
// APPLE_CLIENT_ID is the Services ID the *web* OAuth provider's aud claim
// carries (see src/lib/apple-client-secret.ts); native Sign in with Apple
// instead presents the app's own bundle ID as aud. Both resolve to the
// same Apple Developer configuration and the same pool of users.
function nativeBundleId(): string {
  return process.env.APPLE_MOBILE_CLIENT_ID || "one.zrp.social";
}

export async function POST(req: NextRequest) {
  // ⚠️ SECURITY: matches the mobile Google/credentials login routes' own
  // limits - a valid Apple identity token can't be brute-forced, but
  // nothing should let an attacker force unlimited JWKS verification +
  // Prisma lookups per request either.
  const limit = await rateLimit(req, { limit: 20, window: 900, type: "mobile-apple-login" });
  if (!limit.success) return limit.response!;

  let body: { identityToken?: unknown; nonce?: unknown; fullName?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (typeof body.identityToken !== "string" || !body.identityToken) {
    return NextResponse.json({ error: "identityToken is required" }, { status: 400 });
  }

  const webClientId = process.env.APPLE_CLIENT_ID;
  const audiences = [webClientId, nativeBundleId()].filter((v): v is string => !!v);
  if (audiences.length === 0) {
    console.error("Mobile Apple login error: no Apple client id configured");
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }

  let identity;
  try {
    identity = await verifyAppleIdentityToken(body.identityToken, {
      audiences,
      nonce: typeof body.nonce === "string" ? body.nonce : undefined,
    });
  } catch (err) {
    console.error("Mobile Apple login error verifying identity token:", err);
    return NextResponse.json({ error: "Invalid Apple sign-in token" }, { status: 401 });
  }

  if (!identity.email || !identity.emailVerified) {
    return NextResponse.json({ error: "Invalid Apple sign-in token" }, { status: 401 });
  }

  // Apple delivers the user's name directly to the client - never inside
  // the identityToken - and only on the very first authorization for this
  // app + Apple ID; it will never be sent again after that. The client
  // must capture and forward it here on that first call. findOrCreateOAuthUser
  // already only uses name/image when *creating* a new user, so this is a
  // no-op for a returning user exactly like the Google flow.
  const fullName = typeof body.fullName === "string" && body.fullName.trim() ? body.fullName.trim() : null;

  const user = await findOrCreateOAuthUser(identity.email, fullName, null);

  if (!user) {
    return NextResponse.json({ error: "This account has been suspended" }, { status: 403 });
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    console.error("Mobile Apple login error: NEXTAUTH_SECRET is not configured");
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }

  const features = getFeatureStatus({ plan: user.plan });

  // Same token shape /api/mobile/auth/login and /api/mobile/auth/google
  // produce - see those files' own comments on why this must match
  // exactly.
  const sessionToken = await encode({
    token: {
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.username,
      isAdmin: user.isAdmin,
      role: user.role,
      badgeType: user.badgeType,
      avatarUrl: user.avatarUrl,
      onboardingCompleted: user.onboardingCompleted,
      banned: user.banned,
      emailVerified: user.emailVerified,
      plan: user.plan,
      features,
    },
    secret,
    maxAge: SESSION_MAX_AGE,
  });

  return NextResponse.json({
    sessionToken,
    cookieName: secureCookieName(),
    expiresInSeconds: SESSION_MAX_AGE,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      avatarUrl: user.avatarUrl,
      badgeType: user.badgeType,
      role: user.role,
      plan: user.plan,
      onboardingCompleted: user.onboardingCompleted,
    },
  });
}
