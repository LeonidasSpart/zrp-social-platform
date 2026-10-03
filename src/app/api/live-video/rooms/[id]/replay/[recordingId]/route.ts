import { NextResponse } from "next/server";
import { deleteRecording } from "@/lib/live-replay/replay-service";
import { withLiveAudioAuth as withLiveVideoAuth } from "@/lib/live-video/route-helpers";

export async function DELETE(_req: Request, props: { params: Promise<{ id: string; recordingId: string }> }) {
  const { id, recordingId } = await props.params;
  return withLiveVideoAuth(async (userId) => {
    await deleteRecording({ actorId: userId, roomType: "VIDEO", roomId: id, recordingId });
    return NextResponse.json({ success: true });
  });
}
