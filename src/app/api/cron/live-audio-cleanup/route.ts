import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { cleanupAbandonedRooms } from "@/lib/live-audio/room-service";

export const dynamic = "force-dynamic";

// Backstop of last resort - see docs/live-audio-architecture.md §5. The
// primary mechanisms (explicit end, LiveKit webhook) handle the vast
// majority of room closures; this only ever acts on a room that both of
// those failed to close, so it is expected to be a no-op most runs.
export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { endedRoomIds } = await cleanupAbandonedRooms();
  if (endedRoomIds.length === 0) {
    return NextResponse.json({ message: "No abandoned rooms found" });
  }
  return NextResponse.json({ message: `Ended ${endedRoomIds.length} abandoned room(s)`, endedRoomIds });
}
