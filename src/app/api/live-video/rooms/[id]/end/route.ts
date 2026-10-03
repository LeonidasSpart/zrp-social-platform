import { NextResponse } from "next/server";
import { endRoom } from "@/lib/live-video/room-service";
import { withLiveAudioAuth as withLiveVideoAuth } from "@/lib/live-video/route-helpers";

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return withLiveVideoAuth(async (userId) => {
    await endRoom(id, userId);
    return NextResponse.json({ success: true });
  });
}
