import { NextResponse } from "next/server";
import { listRecordings } from "@/lib/live-replay/replay-service";
import { withLiveAudioAuth as withLiveVideoAuth } from "@/lib/live-video/route-helpers";

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return withLiveVideoAuth(async () => {
    const recordings = await listRecordings("VIDEO", id);
    return NextResponse.json({ recordings });
  });
}
