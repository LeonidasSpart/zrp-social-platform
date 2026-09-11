import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireStaff, requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit-log";
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const adminCheck = await requireStaff();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const { status, actionType, actionNote } = await req.json();

    // Build the update payload
    const data: any = { status };

    // If status is "actioned", store action details and timestamp
    if (status === "actioned") {
      data.actionType = actionType || null;
      data.actionNote = actionNote || null;
      data.actionedAt = new Date();

      // Denormalize who this action was actually taken against, read
      // from the reported content's owner now while it's still
      // resolvable - the content itself may be deleted moments later as
      // part of carrying out this same action, and the report must
      // still be able to identify its target afterward (for the appeals
      // flow and for the moderation transparency dashboard). Covers
      // every polymorphic report target, not just post/comment - a
      // listing/challenge/opportunity/campaign report actioned before
      // this was previously left with no identifiable target at all.
      const current = await prisma.report.findUnique({
        where: { id },
        select: {
          post: { select: { authorId: true } },
          comment: { select: { authorId: true } },
          listing: { select: { sellerId: true } },
          challenge: { select: { creatorId: true } },
          opportunity: { select: { posterId: true } },
          campaign: { select: { organizerId: true } },
        },
      });
      data.targetUserId =
        current?.post?.authorId ??
        current?.comment?.authorId ??
        current?.listing?.sellerId ??
        current?.challenge?.creatorId ??
        current?.opportunity?.posterId ??
        current?.campaign?.organizerId ??
        null;
    } else {
      // Optionally clear action fields when status changes away from actioned
      data.actionType = null;
      data.actionNote = null;
      data.actionedAt = null;
    }

    const report = await prisma.report.update({
      where: { id },
      data,
    });

    await logAdminAction({
      actor: adminCheck.session,
      action: "report.update_status",
      targetType: "Report",
      targetId: id,
      metadata: { status, actionType, actionNote },
    });

    return NextResponse.json(report);
  } catch (error) {
    console.error("Error updating report:", error);
    return NextResponse.json(
      { error: "Failed to update report" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/reports/[id]
 *
 * Permanently remove a report that moderation has already worked
 * through. There was previously no way to do this at all - the Reports
 * admin UI only ever rendered action buttons for status === "pending"
 * (Dismiss/Review/Action), so once a report left "pending" it stayed in
 * the queue forever with no control to remove it.
 *
 * Two things are enforced here, not just in the UI, because the UI is
 * never the security/integrity boundary:
 *
 *  - A "pending" report can't be deleted. It's still an open moderation
 *    queue item; deleting it would make it silently vanish with no
 *    decision ever recorded, instead of clearing out something already
 *    resolved.
 *
 *  - A report with an appeal on file can't be deleted. Appeal.reportId
 *    is `onDelete: Cascade` (see schema.prisma) by design, so an appeal
 *    never outlives the report it argues against in the ordinary
 *    lifecycle - but an appeal that already exists is itself part of
 *    the moderation-transparency record (who appealed, what staff
 *    decided, when). Deleting the report out from under a live appeal
 *    would silently destroy that record, which is exactly the audit
 *    loss the schema comments on Report/Appeal already warn against.
 *    Blocked rather than cascaded past.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // ⚠️ SECURITY: this used to call requireStaff(), which - per
  // isModeratorState() in auth-state.ts - also passes any MODERATOR, not
  // just ADMIN. Deleting a report is a destructive, unrecoverable action
  // against the moderation record (unlike PUT above, which only changes
  // status and is intentionally staff-accessible), so it is gated to
  // admin-only. Same authoritative database-backed check every other
  // admin-only route uses - no parallel role logic.
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  if (!id) {
    return NextResponse.json({ error: "Report ID is required" }, { status: 400 });
  }

  try {
    const report = await prisma.report.findUnique({
      where: { id },
      select: {
        reason: true,
        status: true,
        actionType: true,
        reporterId: true,
        targetUserId: true,
        createdAt: true,
        _count: { select: { appeals: true } },
      },
    });

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    if (report.status === "pending") {
      return NextResponse.json(
        { error: "Resolve, dismiss, or action this report before deleting it." },
        { status: 409 }
      );
    }

    if (report._count.appeals > 0) {
      return NextResponse.json(
        {
          error:
            "This report has an appeal on file and can't be deleted - deleting it would also erase the appeal record.",
        },
        { status: 409 }
      );
    }

    await prisma.report.delete({ where: { id } });

    // The Report row is gone after this, so capture enough of it here
    // that the moderation action itself stays traceable in the
    // (separate, immutable) audit log - reason, prior status and any
    // action already taken, not just "someone deleted report X".
    await logAdminAction({
      actor: adminCheck.session,
      action: "report.delete",
      targetType: "Report",
      targetId: id,
      metadata: {
        reason: report.reason,
        status: report.status,
        actionType: report.actionType,
        reporterId: report.reporterId,
        targetUserId: report.targetUserId,
        createdAt: report.createdAt,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    // Prisma throws P2025 if the row was already deleted between the
    // findUnique above and this delete (e.g. two admins racing on the
    // same report) - that's a 404, not a server error.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    console.error("Error deleting report:", error);
    return NextResponse.json({ error: "Failed to delete report" }, { status: 500 });
  }
}
