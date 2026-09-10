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
// itself, then hands account linking/creation to the exact same
// findOrCreateOAuthUser NextAuth's own signIn callback uses, so a user
// who already has a ZRP account (created via web's Google login, or
// any other method) links to it instead of getting a duplicate.
//
// Two separate accepted audiences, not one - confirmed the hard way
// during real Google Cloud Console configuration: Android's Credential
// Manager requires its `serverClientId` (which becomes the token's
// `aud` claim) to be a Web-type OAuth client in the SAME Google Cloud
// project as the app's own registered Android OAuth clients (the ones
// matching its package name + signing certificate SHA-1). The
// website's own GOOGLE_CLIENT_ID lives in a different Google Cloud
// project entirely, so Android cannot reuse it - GOOGLE_MOBILE_CLIENT_ID
// is a second, separate Web client created specifically alongside the
// Android app's own OAuth clients. Both are accepted here since web
// and Android are still the same real user base linking to the same
// accounts via the same findOrCreateOAuthUser - only the token's
// origin differs, not the account-linking logic.
const googleClient = new OAuth2Client();

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

  // GOOGLE_CLIENT_ID is web's own Google Cloud project; GOOGLE_MOBILE_CLIENT_ID
  // is the separate Web client created in the same project as Android's
  // registered OAuth clients (see this file's own comment above on why
  // these are two different values, not one shared client). Either is
  // an acceptable audience - whichever platform the sign-in came from.
  const acceptedAudiences = [process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_MOBILE_CLIENT_ID].filter(
    (id): id is string => !!id
  );
  if (acceptedAudiences.length === 0) {
    console.error("Mobile Google login error: neither GOOGLE_CLIENT_ID nor GOOGLE_MOBILE_CLIENT_ID is configured");
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: body.idToken,
      audience: acceptedAudiences,
    });
    payload = ticket.getPayload();
  } catch (err) {
    // Previously a blind catch with no logging at all - "Invalid Google
    // sign-in token" covered every possible cause (wrong/expired
    // audience, an actual network failure reaching Google's JWKS
    // endpoint, clock skew, a malformed token) with zero way to tell
    // them apart from Railway's own logs. google-auth-library's
    // verifyIdToken throws a plain Error whose message names the real
    // reason (e.g. "Wrong recipient, payload audience != requested
    // audience" for a client ID mismatch) - logging it costs nothing
    // sensitive (the error never contains the token itself) and is the
    // only way to distinguish "this token's audience doesn't match
    // acceptedAudiences" from "Google's servers were unreachable" after
    // the fact.
    console.error(
      "Mobile Google login error: ID token verification failed:",
      err instanceof Error ? err.message : err
    );
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
