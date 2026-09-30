import { NextRequest, NextResponse } from "next/server";
// requireStaff (ADMIN or MODERATOR) - this is core content-moderation work.
// Sensitive/financial admin routes (roles, plan changes, payments, analytics)
// stay on requireAdmin.
import { requireStaff, requireAdminToModifyStaffBan } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { invalidateUserAuthState } from "@/lib/auth-state";
import { logAdminAction } from "@/lib/audit-log";
import { forceLeaveAllLiveAudioRooms } from "@/lib/live-audio/room-service";
import { disconnectAllSocketsForUser } from "@/lib/socket-emit";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const adminCheck = await requireStaff();
  if (!adminCheck.authorized) return adminCheck.response;

  const userId = params.id;

  // Optional explicit target state ({ banned: true|false }). The admin UI
  // sends it so a double-submit, or two staff acting on the same stale
  // row, can't flip a ban straight back off. Omitted = legacy toggle.
  const body = await req.json().catch(() => ({}));
  const requested: boolean | undefined =
    typeof body?.banned === "boolean" ? body.banned : undefined;

  if (userId === adminCheck.session.user.id) {
    return NextResponse.json({ error: "You can't ban your own account." }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { banned: true, role: true, isAdmin: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ⚠️ SECURITY: this route is staff-level (moderators included), but a
    // banned account fails every admin/staff check. Without this, any
    // moderator could lock every admin (and every other moderator) out
    // of the platform. Only a full admin may ban/unban a staff account.
    // Shared with admin/appeals/[id]/route.ts, which performs the same
    // banned:false mutation through a second path (overturning a
    // BAN_USER appeal) and needs the identical rule.
    const staffBanError = await requireAdminToModifyStaffBan(userId, adminCheck.session);
    if (staffBanError) return staffBanError;

    const nextBanned = requested ?? !user.banned;
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { banned: nextBanned },
    });

    // A ban must bite immediately: drop the cached auth state so the
    // next request from this user (any route, any client) sees it.
    invalidateUserAuthState(userId);

    // A ban must also bite anyone this user is currently speaking to in
    // a Live Audio room - an old realtime connection must not let them
    // keep talking just because requireActiveUser()'s fresh ban check
    // only runs on their NEXT request, which may never come if the
    // media connection itself stays open. Never blocks the ban response
    // on this: it's a best-effort sweep of a realtime feature, not the
    // ban itself.
    if (updated.banned) {
      void forceLeaveAllLiveAudioRooms(userId).catch((err) =>
        console.error(`Failed to sweep Live Audio rooms for banned user ${userId}:`, err)
      );

      // ⚠️ SECURITY: the same "already-open connection outlives the
      // ban" gap Live Audio had, but for DMs and calls - an already-
      // connected socket has no periodic re-check and no backing REST
      // call-signaling write to gate it. Force-close every socket this
      // user currently has open so a ban actually bites in realtime,
      // not just on their next HTTP request.
      disconnectAllSocketsForUser(userId);
    }

    await logAdminAction({
      actor: adminCheck.session,
      action: updated.banned ? "user.ban" : "user.unban",
      targetType: "User",
      targetId: userId,
    });

    return NextResponse.json({ banned: updated.banned });
  } catch (error) {
    console.error("Ban toggle error:", error);
    return NextResponse.json({ error: "Failed to toggle ban" }, { status: 500 });
  }
}
