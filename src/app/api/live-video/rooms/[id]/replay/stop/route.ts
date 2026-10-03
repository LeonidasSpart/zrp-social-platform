import { NextResponse } from "next/server";
import { stopRecording } from "@/lib/live-replay/replay-service";
import { withLiveAudioAuth as withLiveVideoAuth } from "@/lib/live-video/route-helpers";

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return withLiveVideoAuth(async (userId) => {
    await stopRecording({ actorId: userId, roomType: "VIDEO", roomId: id });
    return NextResponse.json({ success: true });
  });
}
