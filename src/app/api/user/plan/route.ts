import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { invalidateUserAuthState } from "@/lib/auth-state";

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { plan } = await req.json();

  // Self-service is only allowed to downgrade to free.
  // Upgrades must go through payment verification (admin/payments/verify).
  if (plan !== "free") {
    return NextResponse.json(
      { error: "Plan upgrades require payment verification" },
      { status: 403 }
    );
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: { plan: "free" },
  });
  invalidateUserAuthState(session.user.id);

  return NextResponse.json({ plan: user.plan });
}
