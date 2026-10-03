import { NextResponse } from "next/server";
import { deleteMessage } from "@/lib/live-chat/chat-service";
import { withLiveAudioAuth as withLiveVideoAuth } from "@/lib/live-video/route-helpers";

export async function DELETE(_req: Request, props: { params: Promise<{ id: string; messageId: string }> }) {
  const { id, messageId } = await props.params;
  return withLiveVideoAuth(async (userId) => {
    await deleteMessage({ actorId: userId, roomType: "VIDEO", roomId: id, messageId });
    return NextResponse.json({ success: true });
  });
}
