import { NextResponse } from "next/server";
import { listRecordings } from "@/lib/live-replay/replay-service";
import { withLiveAudioAuth } from "@/lib/live-audio/route-helpers";

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return withLiveAudioAuth(async () => {
    const recordings = await listRecordings("AUDIO", id);
    return NextResponse.json({ recordings });
  });
}
