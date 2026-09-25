import { NextRequest, NextResponse } from "next/server";
// requireStaff (ADMIN or MODERATOR) - this is core content-moderation work.
// Sensitive/financial admin routes (roles, plan changes, payments, analytics)
// stay on requireAdmin.
import { requireStaff } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { invalidateUserAuthState } from "@/lib/auth-state";
import { logAdminAction } from "@/lib/audit-log";

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
    const targetIsStaff = user.isAdmin || user.role === "ADMIN" || user.role === "MODERATOR";
    if (targetIsStaff) {
      const actor = await prisma.user.findUnique({
        where: { id: adminCheck.session.user.id },
        select: { role: true, isAdmin: true },
      });
      if (!actor || !(actor.isAdmin || actor.role === "ADMIN")) {
        return NextResponse.json(
          { error: "Only an admin can ban or unban a staff account." },
          { status: 403 }
        );
      }
    }

    const nextBanned = requested ?? !user.banned;
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { banned: nextBanned },
    });

    // A ban must bite immediately: drop the cached auth state so the
    // next request from this user (any route, any client) sees it.
    invalidateUserAuthState(userId);

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
