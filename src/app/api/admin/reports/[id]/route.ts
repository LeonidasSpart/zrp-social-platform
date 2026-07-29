import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const { status } = await req.json();
    const report = await prisma.report.update({
      where: { id: params.id },
      data: { status },
    });
    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json({ error: "Failed to update report" }, { status: 500 });
  }
}
