import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { rateLimit } from "@/lib/rate-limit";
import { getFeatureStatus } from "@/lib/permissions";

// ─── Helper: Check feature from token ─────────────────────────────
function hasFeature(token: any, feature: keyof ReturnType<typeof getFeatureStatus>): boolean {
  // Token may not have features yet – compute on the fly
  if (!token) return false;
  const features = token.features || getFeatureStatus({ plan: token.plan || 'free' });
  return features[feature] === true;
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // ─── EXEMPT PATHS ──────────────────────────────────────────────────
  const exemptPaths = [
    "/api/auth/session",
    "/api/auth/callback",
    "/api/auth/csrf",
    "/api/auth/providers",
    "/api/auth/signin",
    "/api/auth/signout",
    "/api",
    "/_next",
    "/favicon.ico",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/onboarding",
  ];

  if (exemptPaths.some((p) => path.startsWith(p))) {
    return NextResponse.next();
  }

  // ─── RATE LIMIT (only for auth endpoints we didn't exempt) ──────
  if (path.startsWith("/api/auth")) {
    if (path.includes("login") || path.includes("register") || path.includes("signup")) {
      const result = await rateLimit(req, {
        limit: 5,
        window: 900,
        type: "auth-login",
      });
      if (!result.success) return result.response;
    }
    return NextResponse.next();
  }

  // ─── GET TOKEN ─────────────────────────────────────────────────────
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  // ─── BANNED CHECK ──────────────────────────────────────────────────
  if (token?.banned === true) {
    const response = NextResponse.redirect(new URL("/login?error=banned", req.url));
    response.cookies.delete("next-auth.session-token");
    response.cookies.delete("next-auth.csrf-token");
    return response;
  }

  // ─── ONBOARDING CHECK ─────────────────────────────────────────────
  if (token && token.onboardingCompleted === false) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  // ─── GUEST HOMEPAGE PROTECTION ────────────────────────────────────
  // A first-time visitor with no session hitting "/" was previously
  // let through by middleware entirely, leaving the client-side page
  // to render the full authenticated feed shell (stories bar, post
  // composer, feed tabs - each firing their own authenticated fetches)
  // and only redirect to /login afterward via a useEffect. That meant
  // a visible flash of the logged-in homepage plus a burst of API
  // calls that were always going to 401, for every guest, every time.
  // Redirecting here, before any of that ever renders or fetches,
  // fixes it at the root rather than papering over it client-side.
  // Exact match only ("/") - this intentionally does not touch other
  // routes (profile pages, search, etc.) that may be fine for guests
  // and weren't part of what was reported.
  if (path === "/" && !token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // ─── FEATURE‑BASED ROUTE PROTECTION ──────────────────────────────
  // These routes require specific plan features

  // Team Management routes
  if (
    path.startsWith("/settings/team") ||
    path.startsWith("/api/team")
  ) {
    if (!token) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (!hasFeature(token, "teamManagement")) {
      // Redirect to pricing or show 403
      return NextResponse.redirect(new URL("/pricing?feature=team", req.url));
    }
  }

  // API Access routes
  if (
    path.startsWith("/settings/api-keys") ||
    path.startsWith("/api/api-keys")
  ) {
    if (!token) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (!hasFeature(token, "apiAccess")) {
      return NextResponse.redirect(new URL("/pricing?feature=api", req.url));
    }
  }

  // ─── RATE LIMIT OTHER API ROUTES (if needed) ──────────────────
  if (path.startsWith("/api/") && !path.startsWith("/api/auth")) {
    // Add custom rate limiting if needed
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
