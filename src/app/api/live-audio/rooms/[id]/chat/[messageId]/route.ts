import { NextResponse } from "next/server";
import { deleteMessage } from "@/lib/live-chat/chat-service";
import { withLiveAudioAuth } from "@/lib/live-audio/route-helpers";

export async function DELETE(_req: Request, props: { params: Promise<{ id: string; messageId: string }> }) {
  const { id, messageId } = await props.params;
  return withLiveAudioAuth(async (userId) => {
    await deleteMessage({ actorId: userId, roomType: "AUDIO", roomId: id, messageId });
    return NextResponse.json({ success: true });
  });
}
