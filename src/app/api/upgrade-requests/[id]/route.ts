import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify admin
  const admin = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (admin?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { action } = await req.json(); // "approve" or "deny"
  const requestId = params.id;

  const request = await prisma.upgradeRequest.findUnique({
    where: { id: requestId },
    include: { user: true },
  });

  if (!request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  if (request.status !== "pending") {
    return NextResponse.json(
      { error: "Request already processed" },
      { status: 400 }
    );
  }

  if (action === "approve") {
    // Update user's plan
    await prisma.user.update({
      where: { id: request.userId },
      data: { plan: request.requestedPlan },
    });

    // Mark request as approved
    await prisma.upgradeRequest.update({
      where: { id: requestId },
      data: {
        status: "approved",
        approvedBy: session.user.id,
        approvedAt: new Date(),
      },
    });

    // ─── Optionally send notification to user ──────────────────────

    return NextResponse.json({ success: true, message: "Plan upgraded." });
  } else if (action === "deny") {
    await prisma.upgradeRequest.update({
      where: { id: requestId },
      data: {
        status: "denied",
        approvedBy: session.user.id,
        approvedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, message: "Request denied." });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
