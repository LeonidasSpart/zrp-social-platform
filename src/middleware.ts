import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { rateLimit } from "@/lib/rate-limit";
import { getFeatureStatus } from "@/lib/permissions";

// ─── Helper: Check feature from token ─────────────────────────────
function hasFeature(
  token: any,
  feature: keyof ReturnType<typeof getFeatureStatus>
): boolean {
  // Token may not have features yet – compute on the fly
  if (!token) return false;

  const features =
    token.features ||
    getFeatureStatus({ plan: token.plan || "free" });

  return features[feature] === true;
}

// ─── AUTH FLOW PAGES ───────────────────────────────────────────────
//
// Showing these to someone who already has a valid session is the bug
// that was previously reported. Header/BottomNav read the session
// directly via useSession() and can otherwise render authenticated
// chrome on the login/signup pages.
//
// Signed-in visitors are therefore redirected to "/" instead of
// being shown the authentication form again.
//
const AUTH_FLOW_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
];

// ─── PUBLIC PAGES ──────────────────────────────────────────────────
//
// These pages never require a session.
//
// Includes marketing/legal pages and ZRP News, which is a public
// reading surface by design.
//
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
];

// ─── PUBLIC STATIC ASSETS ──────────────────────────────────────────
//
// IMPORTANT:
//
// Files inside /public must NOT be protected by authentication.
//
// This includes the official ZRP logo and all PWA/static assets.
//
// Without this bypass, an unauthenticated visitor can request:
//
//   /logo.png
//
// and the authentication middleware can redirect that request to:
//
//   /login
//
// Next.js then receives HTML instead of an image and can report:
//
//   The requested resource isn't a valid image for /logo.png
//
// Keep the official ZRP logo unchanged.
//
const PUBLIC_ASSET_EXTENSIONS =
  /\.(?:png|jpg|jpeg|gif|webp|svg|ico|avif|woff|woff2|ttf|otf|mp4|webm|json|txt)$/i;

// Explicit public infrastructure files that do not necessarily match
// the extension list above or should always bypass authentication.
const PUBLIC_INFRA_PATHS = [
  "/sw.js",
  "/manifest.json",
  "/manifest.webmanifest",
  "/offline.html",
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
  // Static assets must always be available without authentication.
  //
  // This is especially important for:
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
  // and uploaded/static media served through public routes.
  //
  if (PUBLIC_ASSET_EXTENSIONS.test(path)) {
    return NextResponse.next();
  }

  // ─── PUBLIC PWA / INFRASTRUCTURE FILES ───────────────────────────
  //
  // These files must also be available before authentication.
  //
  if (pathMatches(path, PUBLIC_INFRA_PATHS)) {
    return NextResponse.next();
  }

  // ─── NEXT.JS INFRASTRUCTURE EXEMPT PATHS ─────────────────────────
  //
  // These never need a token at all.
  //
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

  // ─── RATE LIMIT ──────────────────────────────────────────────────
  //
  // Only applies to authentication endpoints that were not exempted
  // above.
//
  if (path.startsWith("/api/auth")) {
    if (
      path.includes("login") ||
      path.includes("register") ||
      path.includes("signup")
    ) {
      const result = await rateLimit(req, {
        limit: 5,
        window: 900,
        type: "auth-login",
      });

      if (!result.success) {
        return result.response;
      }
    }

    return NextResponse.next();
  }

  // ─── GET TOKEN ───────────────────────────────────────────────────
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // ─── API ROUTES ──────────────────────────────────────────────────
  //
  // API routes continue to handle their own authentication inside
  // their respective route handlers.
  //
  // The middleware only performs the global banned-user check here.
  //
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
  // Signed-in visitors hitting /login, /signup, etc. are redirected
  // home.
  //
  // Banned users are deliberately excluded here because the banned
  // redirect below sends them to /login?error=banned.
  //
  if (pathMatches(path, AUTH_FLOW_PATHS)) {
    if (token && !token.banned) {
      return NextResponse.redirect(
        new URL("/", req.url)
      );
    }

    return NextResponse.next();
  }

  // ─── PUBLIC PAGES ────────────────────────────────────────────────
  //
  // Public pages are accessible without authentication.
  //
  if (pathMatches(path, PUBLIC_PATHS)) {
    return NextResponse.next();
  }

  // ─── BANNED USER CHECK ───────────────────────────────────────────
  //
  // Banned users are redirected to the login page with the appropriate
  // error indicator.
  //
  if (token?.banned === true) {
    const response = NextResponse.redirect(
      new URL("/login?error=banned", req.url)
    );

    response.cookies.delete("next-auth.session-token");
    response.cookies.delete("next-auth.csrf-token");

    return response;
  }

  // ─── REQUIRE AUTHENTICATION ──────────────────────────────────────
  //
  // Everything that isn't explicitly public requires authentication.
  //
  if (!token) {
    return NextResponse.redirect(
      new URL("/login", req.url)
    );
  }

  // ─── ONBOARDING CHECK ─────────────────────────────────────────────
  //
  // Users who have authenticated but haven't completed onboarding
  // are redirected to /onboarding.
  //
  if (token.onboardingCompleted === false) {
    return NextResponse.redirect(
      new URL("/onboarding", req.url)
    );
  }

  // ─── FEATURE-BASED ROUTE PROTECTION ──────────────────────────────
  //
  // These routes require specific plan features.
  //
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
// Keep Next.js internal static/image optimization routes outside the
// middleware. Public assets such as /logo.png are additionally handled
// explicitly above.
//
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
