import { NextResponse } from "next/server";
import { startScheduledRoom } from "@/lib/live-video/room-service";
import { withLiveAudioAuth as withLiveVideoAuth } from "@/lib/live-video/route-helpers";

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return withLiveVideoAuth(async (userId) => {
    const room = await startScheduledRoom(id, userId);
    return NextResponse.json({ room });
  });
}
