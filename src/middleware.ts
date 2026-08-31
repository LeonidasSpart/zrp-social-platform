import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getFeatureStatus } from "@/lib/permissions";

// ─── Helper: Check feature from token ─────────────────────────────
function hasFeature(
  token: any,
  feature: keyof ReturnType<typeof getFeatureStatus>
): boolean {
  if (!token) return false;

  const features =
    token.features ||
    getFeatureStatus({ plan: token.plan || "free" });

  return features[feature] === true;
}

// ─── AUTH FLOW PAGES ───────────────────────────────────────────────

const AUTH_FLOW_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
];

// ─── PUBLIC PAGES ──────────────────────────────────────────────────

const PUBLIC_PATHS = [
  "/about",
  "/careers",
  "/charity",
  "/contact",
  "/faq",
  "/help",
  "/investors",
  "/press",
  "/pricing",
  "/privacy",
  "/terms",
  "/news",
  "/transparency",
];

// ─── PUBLIC STATIC ASSETS ──────────────────────────────────────────
//
// IMPORTANT:
// Middleware must not protect static assets.
// This also prevents authentication redirects from replacing
// images such as /logo.png with HTML.

const PUBLIC_ASSET_EXTENSIONS =
  /\.(?:png|jpg|jpeg|gif|webp|svg|ico|avif|woff|woff2|ttf|otf|mp4|webm|json|txt)$/i;

const PUBLIC_INFRA_PATHS = [
  "/sw.js",
  "/manifest.json",
  "/manifest.webmanifest",
  "/offline.html",
  "/sitemap.xml",
  "/robots.txt",
];

function pathMatches(path: string, list: string[]) {
  return list.some(
    (p) => path === p || path.startsWith(p + "/")
  );
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // ─── PUBLIC STATIC ASSETS ────────────────────────────────────────
  //
  // Do this BEFORE any authentication/token logic.
  //
  // Most importantly, this keeps:
  //
  // /logo.png
  // /favicon.ico
  // /icon.png
  // /icon-192.png
  // /icon-192-maskable.png
  // /icon-512.png
  // /icon-512-maskable.png
  // /splash.png
  // /og-image.png
  //
  // publicly accessible.

  if (PUBLIC_ASSET_EXTENSIONS.test(path)) {
    return NextResponse.next();
  }

  // ─── PUBLIC PWA / INFRASTRUCTURE FILES ───────────────────────────

  if (pathMatches(path, PUBLIC_INFRA_PATHS)) {
    return NextResponse.next();
  }

  // ─── NEXT.JS / AUTH INFRASTRUCTURE ───────────────────────────────
  //
  // IMPORTANT:
  // Do NOT import Redis or the server-side rate limiter here.
  //
  // Next.js middleware can execute in an Edge runtime.
  // Importing the Node Redis client through middleware was causing:
  //
  // TypeError: K.URL is not a constructor
  //
  // Rate limiting remains protected inside the actual API routes
  // and NextAuth credentials authorization.

  const infraExemptPaths = [
    "/api/auth/session",
    "/api/auth/callback",
    "/api/auth/csrf",
    "/api/auth/providers",
    "/api/auth/signin",
    "/api/auth/signout",
    "/_next",
    "/favicon.ico",
    "/onboarding",
  ];

  if (
    infraExemptPaths.some((p) => path.startsWith(p))
  ) {
    return NextResponse.next();
  }

  // ─── AUTH API ROUTES ─────────────────────────────────────────────
  //
  // API routes handle their own authentication and rate limiting.
  //
  // Do not call Redis from middleware.

  if (path.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // ─── GET AUTH TOKEN ──────────────────────────────────────────────

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // ─── API ROUTES ──────────────────────────────────────────────────
  //
  // API routes continue to handle their own authentication.
  // Middleware only performs the global banned-user check.

  if (path.startsWith("/api")) {
    if (token?.banned === true) {
      return NextResponse.json(
        { error: "Account banned" },
        { status: 403 }
      );
    }

    return NextResponse.next();
  }

  // ─── AUTH FLOW PAGES ─────────────────────────────────────────────
  //
  // Users with an active session should not see login/signup again.

  if (pathMatches(path, AUTH_FLOW_PATHS)) {
    if (token && !token.banned) {
      return NextResponse.redirect(
        new URL("/", req.url)
      );
    }

    return NextResponse.next();
  }

  // ─── PUBLIC PAGES ────────────────────────────────────────────────

  if (pathMatches(path, PUBLIC_PATHS)) {
    return NextResponse.next();
  }

  // ─── BANNED USER CHECK ───────────────────────────────────────────

  if (token?.banned === true) {
    const response = NextResponse.redirect(
      new URL("/login?error=banned", req.url)
    );

    response.cookies.delete("next-auth.session-token");
    response.cookies.delete("next-auth.csrf-token");

    return response;
  }

  // ─── REQUIRE AUTHENTICATION ──────────────────────────────────────

  if (!token) {
    return NextResponse.redirect(
      new URL("/login", req.url)
    );
  }

  // ─── ONBOARDING CHECK ─────────────────────────────────────────────

  if (token.onboardingCompleted === false) {
    return NextResponse.redirect(
      new URL("/onboarding", req.url)
    );
  }

  // ─── FEATURE-BASED ROUTE PROTECTION ──────────────────────────────

  if (path.startsWith("/settings/team")) {
    if (!hasFeature(token, "teamManagement")) {
      return NextResponse.redirect(
        new URL("/pricing?feature=team", req.url)
      );
    }
  }

  if (path.startsWith("/settings/api-keys")) {
    if (!hasFeature(token, "apiAccess")) {
      return NextResponse.redirect(
        new URL("/pricing?feature=api", req.url)
      );
    }
  }

  return NextResponse.next();
}

// ─── MIDDLEWARE MATCHER ─────────────────────────────────────────────
//
// Keep Next.js internal static/image optimization routes outside
// middleware.
//
// Public assets are additionally handled explicitly above.

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
