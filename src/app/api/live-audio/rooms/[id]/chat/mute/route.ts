import { NextRequest, NextResponse } from "next/server";
import { setChatMute } from "@/lib/live-chat/chat-service";
import { withLiveAudioAuth } from "@/lib/live-audio/route-helpers";
import { LiveChatErrors } from "@/lib/live-chat/errors";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return withLiveAudioAuth(async (userId) => {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.userId !== "string") throw LiveChatErrors.validation("userId is required.");
    const muted = body.muted !== false;

    await setChatMute({ actorId: userId, roomType: "AUDIO", roomId: id, targetUserId: body.userId, muted });
    return NextResponse.json({ success: true });
  });
}
