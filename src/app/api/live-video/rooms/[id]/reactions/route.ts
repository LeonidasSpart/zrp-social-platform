import { NextRequest, NextResponse } from "next/server";
import { sendReaction } from "@/lib/live-reactions/reaction-service";
import { withLiveAudioAuth as withLiveVideoAuth } from "@/lib/live-video/route-helpers";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return withLiveVideoAuth(async (userId) => {
    const body = await req.json().catch(() => null);
    const count = body?.count !== undefined ? Number(body.count) : undefined;

    const result = await sendReaction({ userId, roomType: "VIDEO", roomId: id, count });
    return NextResponse.json({ success: true, ...result });
  });
}
