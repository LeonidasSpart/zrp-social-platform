import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/admin";
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
      // from the post/comment author now while it's still resolvable -
      // the content itself may be deleted moments later as part of
      // carrying out this same action, and the report must still be
      // able to identify its target afterward (for the appeals flow
      // and for the moderation transparency dashboard).
      const current = await prisma.report.findUnique({
        where: { id },
        select: {
          post: { select: { authorId: true } },
          comment: { select: { authorId: true } },
        },
      });
      data.targetUserId = current?.post?.authorId ?? current?.comment?.authorId ?? null;
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
