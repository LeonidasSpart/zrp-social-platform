import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { checkLiveKitHealth } from "@/lib/live-audio/livekit";

/**
 * On-demand LiveKit credential/connectivity check for ops - see the
 * doc comment on checkLiveKitHealth() for why this is a separate,
 * explicitly-triggered call rather than something run on every join.
 * Admin-only: the `detail` field can include the raw LiveKit SDK error
 * text, which is an internal diagnostic, not something to expose to a
 * regular user.
 */
export async function GET() {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const result = await checkLiveKitHealth();
  return NextResponse.json(result);
}
