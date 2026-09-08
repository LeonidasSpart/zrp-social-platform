import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { getFeatureStatus } from "@/lib/permissions";
import { findOrCreateOAuthUser } from "@/lib/auth";
import { verifyAppleIdentityToken } from "@/lib/apple-identity-token";
import { rateLimit } from "@/lib/rate-limit";

// 30 days, matching NextAuth's own default session.maxAge and the same
// value /api/mobile/auth/login and /api/mobile/auth/google already use -
// a token minted here must expire on the same schedule as any other
// session.
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

// See /api/mobile/auth/login/route.ts's own comment on why this mints a
// real NextAuth-compatible encrypted JWT rather than a parallel bearer
// scheme - every existing route already trusts this exact cookie shape.
function secureCookieName(): string {
  const secure =
    process.env.NEXTAUTH_URL?.startsWith("https://") ?? !!process.env.VERCEL;
  return secure ? "__Secure-next-auth.session-token" : "next-auth.session-token";
}

// The native app authenticates with Sign in with Apple, which hands the
// app a signed identity token directly - no browser redirect, so
// NextAuth's own AppleProvider (built for the authorization-code flow the
// website's /login page uses, and configured with a Services ID) cannot
// take it as-is. This is the Apple counterpart of
// /api/mobile/auth/google.
//
// The audience differs from the web flow's and that is not a mistake: a
// native Sign in with Apple token is issued to the APP, so its `aud` is
// the bundle identifier, while the website's is issued to the Services
// ID in APPLE_CLIENT_ID. Both are accepted here; neither is trusted
// without a verified Apple signature.
const NATIVE_BUNDLE_ID = process.env.APPLE_NATIVE_CLIENT_ID || "one.zrp.social";

export async function POST(req: NextRequest) {
  // ⚠️ SECURITY: same IP limit as the Google and password mobile logins.
  // A valid Apple identity token cannot be brute-forced, but nothing
  // should let an attacker force unlimited JWKS fetches, RSA
  // verifications and Prisma lookups either.
  const limit = await rateLimit(req, { limit: 20, window: 900, type: "mobile-apple-login" });
  if (!limit.success) return limit.response;

  let body: { identityToken?: unknown; nonce?: unknown; fullName?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (typeof body.identityToken !== "string" || !body.identityToken) {
    return NextResponse.json({ error: "identityToken is required" }, { status: 400 });
  }
  if (typeof body.nonce !== "string" || !body.nonce) {
    return NextResponse.json({ error: "nonce is required" }, { status: 400 });
  }

  const audiences = [NATIVE_BUNDLE_ID];
  // The Services ID is accepted too, so a token minted for the web
  // client is not rejected out of hand if it ever reaches this route.
  if (process.env.APPLE_CLIENT_ID) audiences.push(process.env.APPLE_CLIENT_ID);

  const identity = await verifyAppleIdentityToken(body.identityToken, audiences, body.nonce);
  if (!identity) {
    return NextResponse.json({ error: "Invalid Apple sign-in token" }, { status: 401 });
  }

  // Apple sends the person's name ONCE, on the first authorization, and
  // never again - so it arrives beside the token rather than inside it,
  // and is absent on every later sign-in. findOrCreateOAuthUser only
  // uses it when creating a new account, which is exactly the one time
  // Apple provides it. Apple never provides an avatar.
  const name = displayName(body.fullName);

  const user = await findOrCreateOAuthUser(identity.email, name, null);

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
  // produce - see those files' comments on why this must match exactly.
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

/** Apple's `{ givenName, familyName }`, joined, or null if it sent none. */
function displayName(fullName: unknown): string | null {
  if (!fullName || typeof fullName !== "object") return null;
  const parts = fullName as { givenName?: unknown; familyName?: unknown };
  const given = typeof parts.givenName === "string" ? parts.givenName.trim() : "";
  const family = typeof parts.familyName === "string" ? parts.familyName.trim() : "";
  const joined = [given, family].filter(Boolean).join(" ");
  return joined || null;
}
