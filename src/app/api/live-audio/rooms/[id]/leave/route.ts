import { NextResponse } from "next/server";
import { leaveRoom } from "@/lib/live-audio/room-service";
import { withLiveAudioAuth } from "@/lib/live-audio/route-helpers";

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return withLiveAudioAuth(async (userId) => {
    await leaveRoom(id, userId);
    return NextResponse.json({ success: true });
  });
}
