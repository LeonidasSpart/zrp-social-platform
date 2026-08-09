import { NextResponse } from "next/server";

// Fetches fresh TURN/STUN credentials from Metered's TURN service.
// Proxied server-side so the app name/key aren't hardcoded in the
// client bundle, and so we can swap providers later without touching
// every call site.
export async function GET() {
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
