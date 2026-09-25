import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { invalidateUserAuthState } from "@/lib/auth-state";
import { logAdminAction } from "@/lib/audit-log";

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const { plan } = await req.json().catch(() => ({}));

  const validPlans = ["free", "pro", "business", "enterprise"];
  if (!validPlans.includes(plan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  try {
    const user = await prisma.user.update({
      where: { id: params.id },
      data: { plan },
      select: { id: true, username: true, plan: true },
    });
    invalidateUserAuthState(params.id);

    await logAdminAction({
      actor: adminCheck.session,
      action: "user.update_plan",
      targetType: "User",
      targetId: params.id,
      metadata: { plan },
    });

    return NextResponse.json(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    console.error("Update plan error:", error);
    return NextResponse.json({ error: "Failed to update plan" }, { status: 500 });
  }
}
