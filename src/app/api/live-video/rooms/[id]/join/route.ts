import { NextRequest, NextResponse } from "next/server";
import { joinRoom } from "@/lib/live-video/room-service";
import { withLiveAudioAuth as withLiveVideoAuth, checkRateLimit } from "@/lib/live-video/route-helpers";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const limited = await checkRateLimit(req, { limit: 20, window: 60, type: "live-video-join" });
  if (limited) return limited;

  return withLiveVideoAuth(async (userId) => {
    const result = await joinRoom(id, userId);
    return NextResponse.json(result);
  });
}
