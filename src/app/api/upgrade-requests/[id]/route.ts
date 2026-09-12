import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { invalidateUserAuthState } from "@/lib/auth-state";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit-log";

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;
  const session = adminCheck.session;

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
    // ⚠️ Claim the request first via a conditional update, the same
    // compare-and-swap pattern the withdrawal approval route uses -
    // without it, two concurrent approvals (a double-click, two admin
    // tabs) both pass the `status !== "pending"` check above, both
    // apply the plan change and both write a duplicate audit-log entry
    // for a single approval. Only one caller can win this update.
    const claimed = await prisma.upgradeRequest.updateMany({
      where: { id: requestId, status: "pending" },
      data: {
        status: "approved",
        approvedBy: session.user.id,
        approvedAt: new Date(),
      },
    });

    if (claimed.count === 0) {
      return NextResponse.json(
        { error: "Request already processed" },
        { status: 409 }
      );
    }

    await prisma.user.update({
      where: { id: request.userId },
      data: { plan: request.requestedPlan },
    });
    invalidateUserAuthState(request.userId);

    // ─── Optionally send notification to user ──────────────────────

    await logAdminAction({
      actor: session,
      action: "upgrade_request.approve",
      targetType: "UpgradeRequest",
      targetId: requestId,
      metadata: { userId: request.userId, plan: request.requestedPlan },
    });

    return NextResponse.json({ success: true, message: "Plan upgraded." });
  } else if (action === "deny") {
    const claimed = await prisma.upgradeRequest.updateMany({
      where: { id: requestId, status: "pending" },
      data: {
        status: "denied",
        approvedBy: session.user.id,
        approvedAt: new Date(),
      },
    });

    if (claimed.count === 0) {
      return NextResponse.json(
        { error: "Request already processed" },
        { status: 409 }
      );
    }

    await logAdminAction({
      actor: session,
      action: "upgrade_request.deny",
      targetType: "UpgradeRequest",
      targetId: requestId,
      metadata: { userId: request.userId, plan: request.requestedPlan },
    });

    return NextResponse.json({ success: true, message: "Request denied." });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
