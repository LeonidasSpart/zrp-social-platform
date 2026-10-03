import { NextRequest, NextResponse } from "next/server";
import { demoteToViewer } from "@/lib/live-video/room-service";
import { withLiveAudioAuth as withLiveVideoAuth } from "@/lib/live-video/route-helpers";
import { LiveVideoErrors } from "@/lib/live-video/errors";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return withLiveVideoAuth(async (userId) => {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.userId !== "string") throw LiveVideoErrors.validation("userId is required.");

    await demoteToViewer(id, userId, body.userId);
    return NextResponse.json({ success: true });
  });
}
