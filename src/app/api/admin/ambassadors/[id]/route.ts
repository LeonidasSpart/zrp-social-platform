import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { logAdminAction } from "@/lib/audit-log";

type RouteContext = { params: Promise<{ id: string }> };

const PROFILE_INCLUDE = {
  user: {
    select: { id: true, username: true, name: true, email: true, avatarUrl: true, badgeType: true },
  },
  reviewedBy: { select: { id: true, username: true, name: true } },
} as const;

const ACTIONS = ["approve", "reject", "suspend", "restore"] as const;
type Action = (typeof ACTIONS)[number];

/**
 * PATCH /api/admin/ambassadors/[id]
 *
 * `id` is the target user's id. Body: { action, reason? }
 *
 *  - approve: PENDING   -> APPROVED
 *  - reject:  PENDING   -> REJECTED
 *  - suspend: APPROVED  -> SUSPENDED
 *  - restore: SUSPENDED -> APPROVED
 *
 * Same shape as PATCH /api/admin/journalists/[id], minus the
 * role/badge sync that route also does - an ambassador profile
 * doesn't grant a Role or a VerifiedBadge, only what the dashboard and
 * world map show, so approving one never needs to touch User.role.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const adminCheck = await requireStaff();
  if (!adminCheck.authorized) return adminCheck.response;

  const { id: userId } = await context.params;

  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action as Action;
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 2000) : null;

    if (!ACTIONS.includes(action)) {
      return NextResponse.json(
        { success: false, error: `Invalid action. Must be one of: ${ACTIONS.join(", ")}` },
        { status: 400 }
      );
    }

    const profile = await prisma.ambassadorProfile.findUnique({ where: { userId } });

    if (!profile) {
      return NextResponse.json(
        { success: false, error: "This user has no ambassador application on file." },
        { status: 404 }
      );
    }

    const REQUIRED_STATUS: Record<Action, string> = {
      approve: "PENDING",
      reject: "PENDING",
      suspend: "APPROVED",
      restore: "SUSPENDED",
    };
    if (profile.status !== REQUIRED_STATUS[action]) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot ${action} a profile with status ${profile.status} (expected ${REQUIRED_STATUS[action]}).`,
        },
        { status: 409 }
      );
    }

    const data: {
      status: "APPROVED" | "REJECTED" | "SUSPENDED";
      level?: "AMBASSADOR";
      reviewedAt: Date;
      reviewedById: string;
      rejectionReason: string | null;
      suspensionReason: string | null;
    } = {
      status: "APPROVED",
      reviewedAt: new Date(),
      reviewedById: adminCheck.session.user.id,
      rejectionReason: null,
      suspensionReason: null,
    };

    switch (action) {
      case "approve":
        data.status = "APPROVED";
        // Every profile is created at EXPLORER (see AmbassadorLevel in
        // schema.prisma) - approval is what unlocks AMBASSADOR. A
        // profile can only reach "approve" from PENDING (enforced by
        // REQUIRED_STATUS above), so it is always still EXPLORER here;
        // there is nothing higher this could accidentally downgrade.
        data.level = "AMBASSADOR";
        break;
      case "reject":
        data.status = "REJECTED";
        data.rejectionReason = reason;
        break;
      case "suspend":
        data.status = "SUSPENDED";
        data.suspensionReason = reason;
        break;
      case "restore":
        // Restoring only reverses the suspension - it must not reset a
        // level the ambassador had already earned (COMMUNITY_LEADER or
        // GLOBAL_AMBASSADOR) back down to AMBASSADOR, so level is left
        // untouched here.
        data.status = "APPROVED";
        break;
    }

    const updatedProfile = await prisma.ambassadorProfile.update({
      where: { userId },
      data,
      include: PROFILE_INCLUDE,
    });

    await logAdminAction({
      actor: adminCheck.session,
      action: `ambassador.${action}`,
      targetType: "User",
      targetId: userId,
      metadata: { reason },
    });

    return NextResponse.json({ success: true, profile: updatedProfile });
  } catch (error) {
    console.error("PATCH /api/admin/ambassadors/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update ambassador status" },
      { status: 500 }
    );
  }
}
