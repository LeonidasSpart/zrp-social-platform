import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

// Fetches fresh TURN/STUN credentials from Metered's TURN service.
// Proxied server-side so the app name/key aren't hardcoded in the
// client bundle, and so we can swap providers later without touching
// every call site.
//
// ⚠️ SECURITY: this used to be unauthenticated. Even without leaking
// the provider secret, unrestricted credential issuance lets anyone
// burn through the TURN provider's quota/cost. Require a session and
// cap how often each user can mint new credentials.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = await rateLimit(req, { limit: 20, window: 60, type: "turn-credentials" });
  if (!limit.success) return limit.response;

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
