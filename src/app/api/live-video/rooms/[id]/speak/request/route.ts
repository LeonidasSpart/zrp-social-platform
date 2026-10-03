import { NextRequest, NextResponse } from "next/server";
import { requestToJoin } from "@/lib/live-video/room-service";
import { withLiveAudioAuth as withLiveVideoAuth, checkRateLimit } from "@/lib/live-video/route-helpers";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const limited = await checkRateLimit(req, { limit: 10, window: 60, type: "live-video-speak-request" });
  if (limited) return limited;

  return withLiveVideoAuth(async (userId) => {
    await requestToJoin(id, userId);
    return NextResponse.json({ success: true });
  });
}
