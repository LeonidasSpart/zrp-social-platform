import { NextRequest, NextResponse } from "next/server";
// requireStaff (ADMIN or MODERATOR) - this is core content-moderation work.
// Sensitive/financial admin routes (roles, plan changes, payments, analytics)
// stay on requireAdmin.
import { requireStaff } from "@/lib/admin";
import { prisma } from "@/lib/db";

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

    return NextResponse.json(report);
  } catch (error) {
    console.error("Error updating report:", error);
    return NextResponse.json({ error: "Failed to update report" }, { status: 500 });
  }
}
