import { NextRequest, NextResponse } from "next/server";
import { reissueToken } from "@/lib/live-audio/room-service";
import { withLiveAudioAuth, checkRateLimit } from "@/lib/live-audio/route-helpers";

// Called on initial connect and again whenever the client is told (via
// the live-audio:role-changed realtime event) that its role changed -
// see docs/live-audio-architecture.md §4/§7 on why a token's grants are
// fixed at mint time rather than mutated in place.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const limited = await checkRateLimit(req, { limit: 30, window: 60, type: "live-audio-token" });
  if (limited) return limited;

  return withLiveAudioAuth(async (userId) => {
    const result = await reissueToken(id, userId);
    return NextResponse.json(result);
  });
}
