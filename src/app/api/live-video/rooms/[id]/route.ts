import { NextResponse } from "next/server";
import { getRoomForViewer } from "@/lib/live-video/room-service";
import { withLiveAudioAuth as withLiveVideoAuth } from "@/lib/live-video/route-helpers";

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return withLiveVideoAuth(async (userId) => {
    const { room, participants, pendingRequestCount, myRole } = await getRoomForViewer(id, userId);
    return NextResponse.json({ room, participants, pendingRequestCount, myRole });
  });
}
