import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { rateLimit } from "@/lib/rate-limit";

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
    "/onboarding", // allow the onboarding page itself
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

  // ─── ONBOARDING CHECK ─────────────────────────────────────────────
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (token) {
    // If authenticated and onboarding not completed, redirect to /onboarding
    if (token.onboardingCompleted === false) {
      return NextResponse.redirect(new URL("/onboarding", req.url));
    }
  }

  // ─── RATE LIMIT OTHER API ROUTES (if needed) ──────────────────
  if (path.startsWith("/api/") && !path.startsWith("/api/auth")) {
    // If you want to rate limit other API routes, do it here.
    // Otherwise just let them through.
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
