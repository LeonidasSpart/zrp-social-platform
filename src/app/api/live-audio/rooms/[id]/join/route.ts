import { NextRequest, NextResponse } from "next/server";
import { joinRoom } from "@/lib/live-audio/room-service";
import { withLiveAudioAuth, checkRateLimit } from "@/lib/live-audio/route-helpers";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  // Bounds join-flooding (mission §16) - a real user joins a given room
  // once per session, not dozens of times a minute.
  const limited = await checkRateLimit(req, { limit: 20, window: 60, type: "live-audio-join" });
  if (limited) return limited;

  return withLiveAudioAuth(async (userId) => {
    const result = await joinRoom(id, userId);
    return NextResponse.json(result);
  });
}
