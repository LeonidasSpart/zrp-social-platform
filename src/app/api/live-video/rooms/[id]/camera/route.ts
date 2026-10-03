import { NextRequest, NextResponse } from "next/server";
import { setParticipantCamera } from "@/lib/live-video/room-service";
import { withLiveAudioAuth as withLiveVideoAuth } from "@/lib/live-video/route-helpers";
import { LiveVideoErrors } from "@/lib/live-video/errors";

// Moderator forcing a participant's camera off - the one moderation
// action with no Live Audio equivalent (a camera and a mic are two
// independently publishable LiveKit tracks). Self camera-on/off is a
// purely client-side room.localParticipant.setCameraEnabled() toggle,
// same as Live Audio's self mic mute, and never calls this route.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return withLiveVideoAuth(async (userId) => {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.userId !== "string") throw LiveVideoErrors.validation("userId is required.");
    const cameraOff = body.cameraOff !== false; // defaults to forcing off; cameraOff:false explicitly restores

    await setParticipantCamera(id, userId, body.userId, cameraOff);
    return NextResponse.json({ success: true });
  });
}
