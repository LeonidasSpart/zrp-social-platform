import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

const VALID_BADGE_TYPES = ["verified", "organization", "government", null];

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const { isAdmin, badgeType } = await req.json();

    const data: { isAdmin?: boolean; badgeType?: string | null } = {};
    if (isAdmin !== undefined) data.isAdmin = isAdmin;
    if (badgeType !== undefined) {
      if (!VALID_BADGE_TYPES.includes(badgeType)) {
        return NextResponse.json({ error: "Invalid badge type" }, { status: 400 });
      }
      data.badgeType = badgeType;
    }

    const updated = await prisma.user.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    await prisma.user.delete({
      where: { id: params.id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
