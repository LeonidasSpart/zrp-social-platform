import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { listLiveRoomsForAdmin } from "@/lib/live-audio/room-service";

/**
 * Every currently-LIVE room, for the admin "force-close an abandoned
 * room" tool - see the room's own force-end endpoint
 * (rooms/[id]/end/route.ts). Includes PRIVATE/COMMUNITY rooms a regular
 * user's discovery feed never shows.
 */
export async function GET() {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const rooms = await listLiveRoomsForAdmin();
  return NextResponse.json({ rooms });
}
