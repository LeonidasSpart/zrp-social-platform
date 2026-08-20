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

// Auth-flow pages: showing these to someone who already has a valid
// session is the bug that was reported - Header/BottomNav read the
// session directly via useSession() and always render the
// authenticated chrome, so an already-logged-in visitor landing on
// /login saw a page that looked half logged-in, half logged-out. These
// get the opposite check from PUBLIC_PATHS below: signed-in visitors
// are bounced to "/" instead of being shown the form again.
const AUTH_FLOW_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password", "/verify-email"];

// Pages that never require a session - marketing/legal pages, and ZRP
// News, which is a public reading surface by design (linked from the
// footer for logged-out visitors, framed as a public newsroom).
const PUBLIC_PATHS = [
  "/about", "/careers", "/charity", "/contact", "/faq", "/help",
  "/investors", "/press", "/pricing", "/privacy", "/terms", "/news",
];

function pathMatches(path: string, list: string[]) {
  return list.some((p) => path === p || path.startsWith(p + "/"));
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // ─── INFRA EXEMPT PATHS ─────────────────────────────────────────────
  // These never need a token at all.
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

  if (infraExemptPaths.some((p) => path.startsWith(p))) {
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

  // ─── API ROUTES ─────────────────────────────────────────────────────
  // Every /api/* route still handles its own auth in-file
  // (getServerSession/getToken/requireAdmin etc) - that's unchanged and
  // intentional. What WAS missing: a banned user's session token is
  // only ever checked at the page level below, so a banned user could
  // still freely call every write API (post, message, etc.) even
  // though loading any page redirected them to /login?error=banned.
  // This closes that gap - but only for the banned check. The
  // onboarding-redirect check deliberately does NOT apply here: the
  // onboarding page itself calls half a dozen API routes (profile
  // save, avatar upload, follow-suggestions, the completion call
  // itself) while onboardingCompleted is still false, so blocking API
  // access until onboarding is done would break onboarding itself.
  // A redirect also wouldn't make sense for a fetch() caller expecting
  // JSON, which is why this returns a plain 403 instead of the
  // page-level redirect-to-/login used below.
  if (path.startsWith("/api")) {
    if (token?.banned === true) {
      return NextResponse.json({ error: "Account banned" }, { status: 403 });
    }
    return NextResponse.next();
  }

  // ─── AUTH-FLOW PAGES ────────────────────────────────────────────────
  // A signed-in visitor hitting /login, /signup, etc. gets sent home
  // instead of seeing the form again. A banned token is deliberately
  // excluded here - the ban-redirect below sends them to
  // /login?error=banned, so this must not immediately bounce them back
  // to "/" before that message can show.
  if (pathMatches(path, AUTH_FLOW_PATHS)) {
    if (token && !token.banned) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  // ─── PUBLIC PAGES ───────────────────────────────────────────────────
  if (pathMatches(path, PUBLIC_PATHS)) {
    return NextResponse.next();
  }

  // ─── BANNED CHECK ──────────────────────────────────────────────────
  if (token?.banned === true) {
    const response = NextResponse.redirect(new URL("/login?error=banned", req.url));
    response.cookies.delete("next-auth.session-token");
    response.cookies.delete("next-auth.csrf-token");
    return response;
  }

  // ─── REQUIRE AUTH FOR EVERYTHING ELSE ──────────────────────────────
  // Previously only "/" itself redirected unauthenticated visitors here
  // - every other page (messages, notifications, search, settings,
  // profile, posts, etc.) relied entirely on each page component
  // checking useSession() client-side and redirecting after the fact.
  // That was inconsistent (some pages, like /search, never actually
  // checked at all - they just silently rendered an empty shell) and
  // always had a visible flash of content before the client-side check
  // could run. This protects every page by default now, the same way
  // "/" already was; AUTH_FLOW_PATHS and PUBLIC_PATHS above are the
  // only carve-outs.
  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // ─── ONBOARDING CHECK ─────────────────────────────────────────────
  if (token.onboardingCompleted === false) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  // ─── FEATURE‑BASED ROUTE PROTECTION ──────────────────────────────
  // These routes require specific plan features. (The matching
  // /api/team and /api/api-keys checks that used to live here never
  // actually ran - "/api" was exempted above before this code was
  // reached - so they were dropped rather than kept as dead code. If
  // those need enforcing again now that /api gets its own handling
  // above, they'd need to be added back inside the API block, with a
  // JSON 403 rather than a redirect.)

  if (path.startsWith("/settings/team")) {
    if (!hasFeature(token, "teamManagement")) {
      return NextResponse.redirect(new URL("/pricing?feature=team", req.url));
    }
  }

  if (path.startsWith("/settings/api-keys")) {
    if (!hasFeature(token, "apiAccess")) {
      return NextResponse.redirect(new URL("/pricing?feature=api", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
