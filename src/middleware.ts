import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // ─── Apply rate limiting to auth API routes ──────────────────
  if (path.startsWith("/api/auth")) {
    // Different limits for different auth actions
    let config;
    if (path.includes("/callback") || path.includes("/session")) {
      // Allow callbacks and session checks more freely
      config = { limit: 100, window: 60, type: "auth-general" };
    } else if (path.includes("/signin") || path.includes("/credentials")) {
      // Login attempts
      config = { limit: 5, window: 900, type: "auth-login" };
    } else if (path.includes("/register") || path.includes("/signup")) {
      // Registration attempts
      config = { limit: 5, window: 3600, type: "auth-register" };
    } else {
      // Default for other auth routes
      config = { limit: 30, window: 60, type: "auth-default" };
    }

    const result = await rateLimit(req, config);
    if (!result.success) {
      return result.response;
    }
  }

  // ─── Continue to the route ────────────────────────────────────
  return NextResponse.next();
}

// ─── Only run on API routes ─────────────────────────────────────
export const config = {
  matcher: "/api/:path*",
};
