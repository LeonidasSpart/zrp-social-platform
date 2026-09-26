import { NextRequest, NextResponse } from "next/server";
import { requestToSpeak } from "@/lib/live-audio/room-service";
import { withLiveAudioAuth, checkRateLimit } from "@/lib/live-audio/route-helpers";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  // Bounds speaker-request spam (mission §16) - a real listener requests
  // once, maybe re-requests occasionally; this generously allows for
  // that without allowing a flood.
  const limited = await checkRateLimit(req, { limit: 10, window: 60, type: "live-audio-speak-request" });
  if (limited) return limited;

  return withLiveAudioAuth(async (userId) => {
    await requestToSpeak(id, userId);
    return NextResponse.json({ success: true });
  });
}
