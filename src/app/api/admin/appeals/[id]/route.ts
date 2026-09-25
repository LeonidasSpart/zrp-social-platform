import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { invalidateUserAuthState } from "@/lib/auth-state";
import { logAdminAction } from "@/lib/audit-log";
import { createNotification } from "@/lib/notifications";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const adminCheck = await requireStaff();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const { status, resolutionNote } = await req.json();
    if (status !== "upheld" && status !== "overturned") {
      return NextResponse.json(
        { error: "status must be 'upheld' or 'overturned'" },
        { status: 400 }
      );
    }

    const appeal = await prisma.appeal.findUnique({
      where: { id },
      include: { report: { select: { actionType: true } } },
    });
    if (!appeal) {
      return NextResponse.json({ error: "Appeal not found" }, { status: 404 });
    }
    if (appeal.status !== "pending") {
      return NextResponse.json({ error: "This appeal was already resolved." }, { status: 409 });
    }

    const actorUsername =
      (adminCheck.session.user as { username?: string | null }).username ?? null;

    // Compare-and-swap on status "pending": two staff resolving the same
    // appeal at once (one upheld, one overturned) used to both pass the
    // read above, leaving the stored decision and the ban state
    // disagreeing and the user notified twice. Only one claim can win.
    const claimed = await prisma.appeal.updateMany({
      where: { id, status: "pending" },
      data: {
        status,
        resolutionNote: typeof resolutionNote === "string" && resolutionNote.trim() ? resolutionNote.trim() : null,
        resolvedById: adminCheck.session.user.id,
        resolvedByUsername: actorUsername,
        resolvedAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      return NextResponse.json({ error: "This appeal was already resolved." }, { status: 409 });
    }
    const updated = await prisma.appeal.findUniqueOrThrow({ where: { id } });

    // BAN_USER is the only moderation action with a real, reversible DB
    // state (User.banned). Everything else (deleted content, warnings,
    // mutes) has no automated undo - overturning those appeals records
    // the decision honestly without claiming a restoration that can't
    // actually happen.
    if (status === "overturned" && appeal.report.actionType === "BAN_USER") {
      await prisma.user.update({
        where: { id: appeal.userId },
        data: { banned: false },
      });
      invalidateUserAuthState(appeal.userId);
      await logAdminAction({
        actor: adminCheck.session,
        action: "user.unban",
        targetType: "User",
        targetId: appeal.userId,
        metadata: { reason: "appeal_overturned", appealId: id },
      });
    }

    await logAdminAction({
      actor: adminCheck.session,
      action: "appeal.resolve",
      targetType: "Appeal",
      targetId: id,
      metadata: { status, reportId: appeal.reportId },
    });

    await createNotification({
      userId: appeal.userId,
      type: "appeal_resolved",
      fromUserId: adminCheck.session.user.id,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error resolving appeal:", error);
    return NextResponse.json({ error: "Failed to resolve appeal" }, { status: 500 });
  }
}
