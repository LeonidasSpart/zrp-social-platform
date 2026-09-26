import { NextResponse } from "next/server";
import { cancelScheduledRoom } from "@/lib/live-audio/room-service";
import { withLiveAudioAuth } from "@/lib/live-audio/route-helpers";

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return withLiveAudioAuth(async (userId) => {
    await cancelScheduledRoom(id, userId);
    return NextResponse.json({ success: true });
  });
}
