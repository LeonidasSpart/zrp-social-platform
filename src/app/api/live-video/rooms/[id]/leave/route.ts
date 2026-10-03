import { NextResponse } from "next/server";
import { leaveRoom } from "@/lib/live-video/room-service";
import { withLiveAudioAuth as withLiveVideoAuth } from "@/lib/live-video/route-helpers";

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return withLiveVideoAuth(async (userId) => {
    await leaveRoom(id, userId);
    return NextResponse.json({ success: true });
  });
}
