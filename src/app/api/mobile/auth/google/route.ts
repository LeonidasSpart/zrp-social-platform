import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { OAuth2Client } from "google-auth-library";
import { getFeatureStatus } from "@/lib/permissions";
import { findOrCreateOAuthUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

// 30 days, matching NextAuth's own default session.maxAge and the
// same value /api/mobile/auth/login/route.ts uses - a token minted
// here must expire on the same schedule as any other session.
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

// See /api/mobile/auth/login/route.ts's own comment on why this mints
// a real NextAuth-compatible encrypted JWT rather than a parallel
// bearer-token scheme - every one of the 217 existing routes already
// trusts this exact cookie shape.
function secureCookieName(): string {
  const secure =
    process.env.NEXTAUTH_URL?.startsWith("https://") ?? !!process.env.VERCEL;
  return secure ? "__Secure-next-auth.session-token" : "next-auth.session-token";
}

// The native app authenticates with Google via Android's Credential
// Manager API, which returns a signed Google ID token directly to the
// app - no browser redirect, so NextAuth's own GoogleProvider (built
// for the authorization-code flow the website's /login page uses)
// can't take it as-is. This endpoint instead verifies that ID token
// itself against the same GOOGLE_CLIENT_ID the website's provider
// already trusts (Credential Manager's GetGoogleIdOption is configured
// with that same Web client ID as its serverClientId, which is what
// ends up in the token's `aud` claim - not a separate Android client
// ID), then hands account linking/creation to the exact same
// findOrCreateOAuthUser NextAuth's own signIn callback uses, so a user
// who already has a ZRP account (created via web's Google login, or
// any other method) links to it instead of getting a duplicate.
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export async function POST(req: NextRequest) {
  // ⚠️ SECURITY: matches verifyCredentials's own IP-based limit (the
  // path email/password mobile login already rate-limits through) -
  // a valid Google ID token can't be brute-forced, but nothing should
  // let an attacker force unlimited JWKS verification + Prisma lookups
  // per request either.
  const limit = await rateLimit(req, { limit: 20, window: 900, type: "mobile-google-login" });
  if (!limit.success) return limit.response;

  let body: { idToken?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (typeof body.idToken !== "string" || !body.idToken) {
    return NextResponse.json({ error: "idToken is required" }, { status: 400 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    console.error("Mobile Google login error: GOOGLE_CLIENT_ID is not configured");
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: body.idToken,
      audience: clientId,
    });
    payload = ticket.getPayload();
  } catch {
    return NextResponse.json({ error: "Invalid Google sign-in token" }, { status: 401 });
  }

  if (!payload?.email || !payload.email_verified) {
    return NextResponse.json({ error: "Invalid Google sign-in token" }, { status: 401 });
  }

  const user = await findOrCreateOAuthUser(payload.email, payload.name, payload.picture);

  if (!user) {
    return NextResponse.json({ error: "This account has been suspended" }, { status: 403 });
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    console.error("Mobile Google login error: NEXTAUTH_SECRET is not configured");
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }

  const features = getFeatureStatus({ plan: user.plan });

  // Same token shape /api/mobile/auth/login/route.ts produces - see
  // that file's own comment on why this must match exactly.
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
