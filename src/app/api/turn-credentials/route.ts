import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkRateLimitKey, getRequestIp } from "@/lib/rate-limit";

// Fetches fresh TURN/STUN credentials from Metered's TURN service.
// Proxied server-side so the app name/key aren't hardcoded in the
// client bundle, and so we can swap providers later without touching
// every call site.
//
// ⚠️ SECURITY: this used to be unauthenticated. Even without leaking
// the provider secret, unrestricted credential issuance lets anyone
// burn through the TURN provider's quota/cost. Require a session and
// cap how often each user can mint new credentials. getServerSession
// already returns null for a banned account (see auth.ts's session
// callback), so that same 401 path covers both "no session" and
// "banned" without a second, separate check.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ⚠️ SECURITY: an IP-only limit lets an authenticated attacker reset
  // their bucket just by rotating IP (or riding ordinary carrier/NAT
  // churn) while continuing to mint credentials from the same account.
  // Pair it with a limit keyed to the verified session id - the same
  // login-ip/login-acct pattern verifyCredentials() already uses for
  // brute-force protection in auth.ts - so either dimension alone is
  // enough to throttle abuse; an attacker has to evade both at once.
  // 20 requests/60s on each: getIceServers() is called at most once per
  // call attempt, as caller or callee (see messages/[username]/page.tsx
  // and CallViewModel.kt), so a real user - even placing a rapid burst
  // of calls, or several attempts across multiple open tabs/devices -
  // stays well under this, while sustained credential-minting abuse is
  // capped regardless of which limiter catches it first.
  const [ipLimit, userLimit] = await Promise.all([
    checkRateLimitKey(`turn-credentials-ip:${getRequestIp(req)}`, 20, 60),
    checkRateLimitKey(`turn-credentials-user:${session.user.id}`, 20, 60),
  ]);

  if (!ipLimit.success || !userLimit.success) {
    const retryAfter = Math.max(ipLimit.retryAfter, userLimit.retryAfter);
    return NextResponse.json(
      { error: "Too many requests. Please try again later.", retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const appName = process.env.METERED_APP_NAME;
  const apiKey = process.env.METERED_API_KEY;

  if (!appName || !apiKey) {
    console.error("Missing METERED_APP_NAME or METERED_API_KEY env vars");
    // Fall back to public STUN-only servers so calls between two open
    // networks can still work, even though TURN relay won't.
    return NextResponse.json([
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ]);
  }

  try {
    const res = await fetch(
      `https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`
    );
    if (!res.ok) {
      throw new Error(`Metered API returned ${res.status}`);
    }
    const iceServers = await res.json();
    return NextResponse.json(iceServers);
  } catch (error) {
    console.error("Failed to fetch TURN credentials:", error);
    return NextResponse.json([
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ]);
  }
}
