import { NextResponse } from "next/server";
import { deleteRecording } from "@/lib/live-replay/replay-service";
import { withLiveAudioAuth } from "@/lib/live-audio/route-helpers";

export async function DELETE(_req: Request, props: { params: Promise<{ id: string; recordingId: string }> }) {
  const { id, recordingId } = await props.params;
  return withLiveAudioAuth(async (userId) => {
    await deleteRecording({ actorId: userId, roomType: "AUDIO", roomId: id, recordingId });
    return NextResponse.json({ success: true });
  });
}
