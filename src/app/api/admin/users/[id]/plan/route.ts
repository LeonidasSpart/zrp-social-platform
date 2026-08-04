import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const { plan } = await req.json();

  const validPlans = ["free", "pro", "business", "enterprise"];
  if (!validPlans.includes(plan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: params.id },
    data: { plan },
    select: { id: true, username: true, plan: true },
  });

  return NextResponse.json(user);
}
