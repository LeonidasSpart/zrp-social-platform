import { NextRequest, NextResponse } from "next/server";
import { promoteToSpeaker } from "@/lib/live-audio/room-service";
import { withLiveAudioAuth } from "@/lib/live-audio/route-helpers";
import { LiveAudioErrors } from "@/lib/live-audio/errors";

// Direct promotion (host/moderator inviting a listener up, no request
// from them required first) - distinct from speak/approve, which
// resolves a listener's own prior request. Both end up calling the same
// underlying transition in room-service.ts.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return withLiveAudioAuth(async (userId) => {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.userId !== "string") throw LiveAudioErrors.validation("userId is required.");

    await promoteToSpeaker(id, userId, body.userId);
    return NextResponse.json({ success: true });
  });
}
