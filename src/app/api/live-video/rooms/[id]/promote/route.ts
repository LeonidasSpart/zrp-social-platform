import { NextRequest, NextResponse } from "next/server";
import { promoteToParticipant } from "@/lib/live-video/room-service";
import { withLiveAudioAuth as withLiveVideoAuth } from "@/lib/live-video/route-helpers";
import { LiveVideoErrors } from "@/lib/live-video/errors";

// Direct promotion (host/moderator inviting a viewer on camera, no
// request from them required first) - distinct from speak/approve,
// which resolves a viewer's own prior request. Both end up calling the
// same underlying transition in room-service.ts.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return withLiveVideoAuth(async (userId) => {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.userId !== "string") throw LiveVideoErrors.validation("userId is required.");

    await promoteToParticipant(id, userId, body.userId);
    return NextResponse.json({ success: true });
  });
}
