import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
// Imported from feature-status.ts directly, NOT @/lib/permissions -
// permissions.ts also re-exports the DB-backed team-membership helpers,
// which import the Prisma client; that would pull @prisma/adapter-pg's
// Node `crypto` dependency into this file's Edge runtime bundle (see
// the "Do NOT import Redis" note below for the same underlying
// constraint) and break every request in production.
import { getFeatureStatus } from "@/lib/feature-status";

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
];

// Deliberately NOT in AUTH_FLOW_PATHS above, even though it looks like
// one: consuming a verification token never authenticates anyone (see
// consumeVerificationToken - it only updates the User row), so bouncing
// an "authenticated" visitor away from this page based on a session
// token was wrong on two counts. First, it silently broke the email-
// change confirmation case, where being logged in while verifying is
// the normal, expected state. Second - the bug this exists to fix -
// if that session token was stale (e.g. left over after the account it
// pointed to was deleted), the bounce sent a brand-new user straight to
// /onboarding on a session that resolves to no User row at all, before
// their new verification link was ever actually consumed, surfacing as
// "User account no longer exists" on a page that assumed it was safe to
// render. This route must always be reachable regardless of session
// state so the token actually gets consumed either way.
const VERIFY_EMAIL_PATH = "/verify-email";

// ─── PUBLIC PAGES ──────────────────────────────────────────────────

const PUBLIC_PATHS = [
  "/about",
  "/ambassadors",
  "/careers",
  "/charity",
  "/community-code",
  "/contact",
  "/faq",
  "/guidelines",
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

  // ─── EMAIL VERIFICATION ──────────────────────────────────────────
  //
  // Always reachable, regardless of session state - see the comment
  // on VERIFY_EMAIL_PATH above.

  if (pathMatches(path, [VERIFY_EMAIL_PATH])) {
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
  //
  // A canonical post link (see src/app/post/[id]/page.tsx) is meant to
  // be shareable with someone who may not have a ZRP account at all -
  // the whole point of the Share feature. It was previously redirected
  // to /login unconditionally by this blanket gate before the page ever
  // got a chance to decide visibility itself, which is the actual
  // reason "recipient can open the exact post" never worked for a
  // logged-out recipient. GET /api/posts/[id] already enforces real
  // visibility (private account, blocked, unpublished - see that
  // route), so this only widens WHO reaches the page, not what it can
  // see. Deliberately narrower than adding "/post" to PUBLIC_PATHS
  // above: this only bypasses the no-token case, so the banned-user
  // check (which runs before this point) and the onboarding check
  // (right below, for anyone who does have a token) are both untouched.
  //
  // /profile, /hashtag and /trust joined this list as part of the
  // social-sharing metadata audit: each already has a real, server-side
  // generateMetadata() (see profile/[username]/layout.tsx,
  // hashtag/[tag]/layout.tsx, trust/[username]/layout.tsx) that builds
  // a correct, privacy-aware <head> for a public/non-banned entity and
  // a generic noindex one for a private/banned/nonexistent one - but a
  // logged-out visitor, INCLUDING a social-preview crawler (which never
  // executes client JS and so never reaches page.tsx's own
  // useSession()-based "not logged in -> /login" redirect), was bounced
  // to /login by this gate before Next.js ever rendered that metadata
  // at all. A shared profile/hashtag/trust link therefore never showed
  // a working preview, for the same class of reason /post's link
  // sharing previously didn't. This does not change what a real,
  // hydrated browser does - page.tsx's own client-side redirect for a
  // signed-out human is untouched - it only lets the server-rendered
  // HTML (and therefore its metadata) reach a request that never runs
  // that client code, i.e. a crawler.
  const PUBLIC_WHEN_LOGGED_OUT_PATHS = ["/post", "/profile", "/hashtag", "/trust"];

  if (!token) {
    if (pathMatches(path, PUBLIC_WHEN_LOGGED_OUT_PATHS)) {
      return NextResponse.next();
    }
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
