import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { invalidateUserAuthState } from "@/lib/auth-state";

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
  invalidateUserAuthState(params.id);

  return NextResponse.json(user);
}
