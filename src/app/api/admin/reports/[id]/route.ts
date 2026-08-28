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
