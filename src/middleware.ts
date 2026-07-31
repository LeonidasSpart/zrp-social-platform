import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // ─── EXEMPT NEXT.AUTH CRITICAL ROUTES ──────────────────────────
  if (
    path.startsWith("/api/auth/session") ||
    path.startsWith("/api/auth/callback") ||
    path.startsWith("/api/auth/csrf") ||
    path.startsWith("/api/auth/providers") ||
    path.startsWith("/api/auth/signin") ||
    path.startsWith("/api/auth/signout")
  ) {
    return NextResponse.next();
  }

  // ─── RATE LIMIT ONLY LOGIN & REGISTER ──────────────────────────
  if (path.startsWith("/api/auth")) {
    // Only apply to login/register endpoints, not session/callback
    if (path.includes("login") || path.includes("register") || path.includes("signup")) {
      const result = await rateLimit(req, {
        limit: 5,
        window: 900, // 15 minutes
        type: "auth-login",
      });
      if (!result.success) {
        return result.response;
      }
    }
  }

  // ─── RATE LIMIT OTHER API ROUTES ───────────────────────────────
  if (path.startsWith("/api/") && !path.startsWith("/api/auth")) {
    // Add specific rate limits for other endpoints
    // We'll handle these inside individual routes instead of middleware
    // to avoid blocking legitimate requests
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
