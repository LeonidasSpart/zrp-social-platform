import { NextResponse } from "next/server";
import { getRoomForViewer } from "@/lib/live-audio/room-service";
import { withLiveAudioAuth } from "@/lib/live-audio/route-helpers";

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return withLiveAudioAuth(async (userId) => {
    const { room, participants, pendingRequestCount, myRole } = await getRoomForViewer(id, userId);
    return NextResponse.json({ room, participants, pendingRequestCount, myRole });
  });
}
