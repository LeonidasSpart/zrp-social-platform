import { NextRequest, NextResponse } from "next/server";
// requireStaff (ADMIN or MODERATOR) - this is core content-moderation work.
// Sensitive/financial admin routes (roles, plan changes, payments, analytics)
// stay on requireAdmin.
import { requireStaff } from "@/lib/admin";
import { prisma } from "@/lib/db";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const adminCheck = await requireStaff();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    await prisma.post.delete({
      where: { id: params.id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete post" }, { status: 500 });
  }
}
