import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { adminForceEndRoom } from "@/lib/live-audio/room-service";
import { LiveAudioError, liveAudioErrorResponseBody } from "@/lib/live-audio/errors";
import { logAdminAction } from "@/lib/audit-log";

/**
 * Admin force-close for a LIVE room the host forgot to end. Bypasses
 * the host/moderator-only check inside the normal end-room route
 * entirely (see adminForceEndRoom's own doc comment) - an admin acting
 * on a room is not, and need not be, a participant in it.
 */
export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;
  const { id: roomId } = await props.params;

  try {
    await adminForceEndRoom(roomId);
  } catch (err) {
    if (err instanceof LiveAudioError) {
      return NextResponse.json(liveAudioErrorResponseBody(err), { status: err.status });
    }
    console.error("Admin force-end room error:", err);
    return NextResponse.json({ error: "Internal server error", code: "internal_error" }, { status: 500 });
  }

  await logAdminAction({
    actor: adminCheck.session,
    action: "live_audio.force_end_room",
    targetType: "LiveAudioRoom",
    targetId: roomId,
  });

  return NextResponse.json({ success: true });
}
