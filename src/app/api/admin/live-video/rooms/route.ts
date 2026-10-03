import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { listLiveRoomsForAdmin } from "@/lib/live-video/room-service";

/**
 * Every currently-LIVE Live Video room, for the admin "force-close an
 * abandoned room" tool - mirrors
 * src/app/api/admin/live-audio/rooms/route.ts exactly.
 */
export async function GET() {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const rooms = await listLiveRoomsForAdmin();
  return NextResponse.json({ rooms });
}
