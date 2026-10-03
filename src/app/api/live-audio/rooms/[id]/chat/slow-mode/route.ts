import { NextRequest, NextResponse } from "next/server";
import { setSlowMode } from "@/lib/live-chat/chat-service";
import { withLiveAudioAuth } from "@/lib/live-audio/route-helpers";
import { LiveChatErrors } from "@/lib/live-chat/errors";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return withLiveAudioAuth(async (userId) => {
    const body = await req.json().catch(() => null);
    const seconds = Number(body?.seconds);
    if (!Number.isFinite(seconds)) throw LiveChatErrors.validation("seconds is required.");

    await setSlowMode({ actorId: userId, roomType: "AUDIO", roomId: id, seconds });
    return NextResponse.json({ success: true });
  });
}
