import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { parseCursorParams } from "@/lib/pagination";
import { createRoom, listDiscoverableRooms } from "@/lib/live-video/room-service";
import { withLiveAudioAuth as withLiveVideoAuth, checkRateLimit } from "@/lib/live-video/route-helpers";

const VISIBILITIES = new Set(["PUBLIC", "COMMUNITY", "PRIVATE"]);

export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, { limit: 5, window: 3600, type: "live-video-create" });
  if (limited) return limited;

  return withLiveVideoAuth(async (userId) => {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.title !== "string") {
      return NextResponse.json({ error: "title is required", code: "validation_error" }, { status: 400 });
    }

    const visibility = VISIBILITIES.has(body.visibility) ? body.visibility : "PUBLIC";
    const scheduledAt =
      typeof body.scheduledAt === "string" && !Number.isNaN(Date.parse(body.scheduledAt))
        ? new Date(body.scheduledAt)
        : undefined;

    const room = await createRoom({
      hostId: userId,
      title: body.title,
      description: typeof body.description === "string" ? body.description : undefined,
      category: typeof body.category === "string" ? body.category : undefined,
      visibility,
      communityId: typeof body.communityId === "string" ? body.communityId : undefined,
      scheduledAt,
    });

    return NextResponse.json({ room }, { status: 201 });
  });
}

// GET is intentionally reachable while logged out, same as Live Audio's
// discovery route - a logged-out visitor can see PUBLIC live rooms.
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, { limit: 60, window: 60, type: "live-video-discover" });
  if (limited) return limited;

  const session = await getServerSession(authOptions);
  const { cursor, limit } = parseCursorParams(req, 20);

  const { rooms, nextCursor } = await listDiscoverableRooms({
    viewerId: session?.user?.id ?? null,
    cursor,
    limit,
  });
  return NextResponse.json({ rooms, nextCursor });
}
