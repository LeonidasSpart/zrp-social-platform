import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { adminForceEndRoom } from "@/lib/live-video/room-service";
import { LiveVideoError, liveVideoErrorResponseBody } from "@/lib/live-video/errors";
import { logAdminAction } from "@/lib/audit-log";

/**
 * Admin force-close for a LIVE Live Video room the host forgot to end -
 * mirrors src/app/api/admin/live-audio/rooms/[id]/end/route.ts exactly.
 */
export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;
  const { id: roomId } = await props.params;

  try {
    await adminForceEndRoom(roomId);
  } catch (err) {
    if (err instanceof LiveVideoError) {
      return NextResponse.json(liveVideoErrorResponseBody(err), { status: err.status });
    }
    console.error("Admin force-end video room error:", err);
    return NextResponse.json({ error: "Internal server error", code: "internal_error" }, { status: 500 });
  }

  await logAdminAction({
    actor: adminCheck.session,
    action: "live_video.force_end_room",
    targetType: "LiveVideoRoom",
    targetId: roomId,
  });

  return NextResponse.json({ success: true });
}
