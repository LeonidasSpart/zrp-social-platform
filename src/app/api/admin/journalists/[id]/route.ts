import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { syncJournalistBadge } from "@/lib/journalist";
import { logAdminAction } from "@/lib/audit-log";

type RouteContext = { params: Promise<{ id: string }> };

const PROFILE_INCLUDE = {
  user: {
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      avatarUrl: true,
      badgeType: true,
      role: true,
    },
  },
  reviewedBy: { select: { id: true, username: true, name: true } },
} as const;

const ACTIONS = ["approve", "reject", "suspend", "restore", "remove"] as const;
type Action = (typeof ACTIONS)[number];

/**
 * PATCH /api/admin/journalists/[id]
 *
 * `id` is the target user's id. Body: { action, reason? }
 *
 *  - approve: PENDING -> VERIFIED (grants badge)
 *  - reject:  PENDING -> REJECTED (role reverts to USER, no badge)
 *  - suspend: VERIFIED -> SUSPENDED (badge removed, role kept so the
 *             dashboard can show the suspension to the user)
 *  - restore: SUSPENDED -> VERIFIED (badge restored)
 *  - remove:  any status -> REJECTED, role reverts to USER, badge
 *             removed. Full revocation of journalist status.
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

    const profile = await prisma.journalistProfile.findUnique({ where: { userId } });

    if (!profile) {
      return NextResponse.json(
        { success: false, error: "This user has no journalist application on file." },
        { status: 404 }
      );
    }

    // ─── Validate the transition ────────────────────────────────
    if (action === "approve" && profile.status !== "PENDING") {
      return NextResponse.json(
        { success: false, error: "Only pending applications can be approved." },
        { status: 409 }
      );
    }
    if (action === "reject" && profile.status !== "PENDING") {
      return NextResponse.json(
        { success: false, error: "Only pending applications can be rejected." },
        { status: 409 }
      );
    }
    if (action === "suspend" && profile.status !== "VERIFIED") {
      return NextResponse.json(
        { success: false, error: "Only verified journalists can be suspended." },
        { status: 409 }
      );
    }
    if (action === "restore" && profile.status !== "SUSPENDED") {
      return NextResponse.json(
        { success: false, error: "Only suspended journalists can be restored." },
        { status: 409 }
      );
    }

    const reviewedAt = new Date();
    const reviewedById = adminCheck.session.user.id;

    let newStatus = profile.status;
    let newRole: "JOURNALIST" | "USER" = "JOURNALIST";
    const data: {
      status?: typeof profile.status;
      reviewedAt?: Date;
      reviewedById?: string;
      rejectionReason?: string | null;
      suspensionReason?: string | null;
    } = { reviewedAt, reviewedById };

    switch (action) {
      case "approve":
        newStatus = "VERIFIED";
        data.status = "VERIFIED";
        data.rejectionReason = null;
        break;
      case "reject":
        newStatus = "REJECTED";
        newRole = "USER";
        data.status = "REJECTED";
        data.rejectionReason = reason;
        break;
      case "suspend":
        newStatus = "SUSPENDED";
        data.status = "SUSPENDED";
        data.suspensionReason = reason;
        break;
      case "restore":
        newStatus = "VERIFIED";
        data.status = "VERIFIED";
        data.suspensionReason = null;
        break;
      case "remove":
        newStatus = "REJECTED";
        newRole = "USER";
        data.status = "REJECTED";
        data.rejectionReason = reason || "Journalist status removed by admin.";
        data.suspensionReason = null;
        break;
    }

    const [updatedProfile] = await prisma.$transaction([
      prisma.journalistProfile.update({
        where: { userId },
        data,
        include: PROFILE_INCLUDE,
      }),
      prisma.user.update({ where: { id: userId }, data: { role: newRole } }),
    ]);

    await syncJournalistBadge(userId, newStatus);

    await logAdminAction({
      actor: adminCheck.session,
      action: `journalist.${action}`,
      targetType: "User",
      targetId: userId,
      metadata: { reason },
    });

    return NextResponse.json({ success: true, profile: updatedProfile });
  } catch (error) {
    console.error("PATCH /api/admin/journalists/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update journalist status" },
      { status: 500 }
    );
  }
}
