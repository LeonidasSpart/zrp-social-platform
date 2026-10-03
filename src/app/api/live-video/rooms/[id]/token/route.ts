import { NextRequest, NextResponse } from "next/server";
import { reissueToken } from "@/lib/live-video/room-service";
import { withLiveAudioAuth as withLiveVideoAuth, checkRateLimit } from "@/lib/live-video/route-helpers";

// Called on initial connect and again whenever the client is told (via
// the live-video:role-changed realtime event) that its role changed -
// same rationale as Live Audio's token route.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const limited = await checkRateLimit(req, { limit: 30, window: 60, type: "live-video-token" });
  if (limited) return limited;

  return withLiveVideoAuth(async (userId) => {
    const result = await reissueToken(id, userId);
    return NextResponse.json(result);
  });
}
