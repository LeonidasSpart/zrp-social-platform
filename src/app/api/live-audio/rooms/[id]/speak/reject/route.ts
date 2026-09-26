import { NextRequest, NextResponse } from "next/server";
import { resolveSpeakerRequest } from "@/lib/live-audio/room-service";
import { withLiveAudioAuth } from "@/lib/live-audio/route-helpers";
import { LiveAudioErrors } from "@/lib/live-audio/errors";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return withLiveAudioAuth(async (userId) => {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.userId !== "string") throw LiveAudioErrors.validation("userId is required.");

    await resolveSpeakerRequest(id, userId, body.userId, false);
    return NextResponse.json({ success: true });
  });
}
