import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const userId = params.id;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { banned: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { banned: !user.banned },
    });

    return NextResponse.json({ banned: updated.banned });
  } catch (error) {
    console.error("Ban toggle error:", error);
    return NextResponse.json({ error: "Failed to toggle ban" }, { status: 500 });
  }
}
