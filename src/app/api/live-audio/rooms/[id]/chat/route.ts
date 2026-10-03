import { NextRequest, NextResponse } from "next/server";
import { sendMessage, listMessages } from "@/lib/live-chat/chat-service";
import { withLiveAudioAuth, checkRateLimit } from "@/lib/live-audio/route-helpers";
import { LiveChatErrors } from "@/lib/live-chat/errors";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return withLiveAudioAuth(async (userId) => {
    const limitResponse = await checkRateLimit(req, { limit: 30, window: 30, type: "live-chat-send" });
    if (limitResponse) return limitResponse;

    const body = await req.json().catch(() => null);
    if (!body || typeof body.body !== "string") throw LiveChatErrors.validation("body is required.");

    const message = await sendMessage({ authorId: userId, roomType: "AUDIO", roomId: id, body: body.body });
    return NextResponse.json({ success: true, message });
  });
}

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return withLiveAudioAuth(async (userId) => {
    const cursor = req.nextUrl.searchParams.get("cursor");
    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;

    const result = await listMessages({ roomType: "AUDIO", roomId: id, viewerId: userId, cursor, limit });
    return NextResponse.json(result);
  });
}
