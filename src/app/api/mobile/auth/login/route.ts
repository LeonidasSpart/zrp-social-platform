import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { getFeatureStatus } from "@/lib/permissions";
import { CredentialsAuthError, verifyCredentials } from "@/lib/auth";

// 30 days, matching NextAuth's own default session.maxAge (authOptions
// never overrides it) - the token this issues must expire on the same
// schedule a browser's session cookie would, not some independently
// chosen value.
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

// The native app has no cookie jar, so it can't authenticate the way a
// browser does - but every existing API route (all 217 of them) already
// trusts a NextAuth-format session token however it arrives, whether
// read via getServerSession's cookies() or getToken()'s req.cookies.
// So rather than inventing a parallel bearer-token auth system that
// every route would need to learn about individually, this endpoint
// mints a real NextAuth-compatible encrypted JWT (the exact same
// encode() NextAuth itself uses for its session cookie) and hands it
// back as a plain string. The native client then attaches it as that
// same cookie on every request - see ApiClient's cookie interceptor -
// and every existing route keeps working completely unmodified.
function secureCookieName(): string {
  const secure =
    process.env.NEXTAUTH_URL?.startsWith("https://") ?? !!process.env.VERCEL;
  return secure ? "__Secure-next-auth.session-token" : "next-auth.session-token";
}

function clientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  return (
    forwardedFor?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  let body: { identifier?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (typeof body.identifier !== "string" || typeof body.password !== "string") {
    return NextResponse.json(
      { error: "identifier and password are required" },
      { status: 400 }
    );
  }

  const identifier = body.identifier.trim();
  const password = body.password.trim();

  if (!identifier || !password) {
    return NextResponse.json(
      { error: "identifier and password are required" },
      { status: 400 }
    );
  }

  let user;
  try {
    user = await verifyCredentials({ identifier, password, ip: clientIp(req) });
  } catch (err) {
    if (err instanceof CredentialsAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Mobile login error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    console.error("Mobile login error: NEXTAUTH_SECRET is not configured");
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }

  const features = getFeatureStatus({ plan: user.plan });

  // Same shape the jwt() callback's credentials branch produces in
  // authOptions - a route reading this token via getServerSession/
  // getToken must see an identical token to what the website's own
  // login flow would have produced, or session.user fields downstream
  // (badges, admin checks, feature gates) would silently differ for
  // native users.
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
