import { NextResponse } from "next/server";
import { startRecording } from "@/lib/live-replay/replay-service";
import { withLiveAudioAuth } from "@/lib/live-audio/route-helpers";

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return withLiveAudioAuth(async (userId) => {
    const result = await startRecording({ actorId: userId, roomType: "AUDIO", roomId: id });
    return NextResponse.json({ success: true, ...result });
  });
}
