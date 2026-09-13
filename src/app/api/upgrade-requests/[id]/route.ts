import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { invalidateUserAuthState } from "@/lib/auth-state";
import { requireAdmin } from "@/lib/admin";

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
    // ⚠️ The claim (updateMany), the plan upgrade, and the audit log
    // all happen inside ONE transaction rather than as separate
    // sequential awaits. Previously the claim committed on its own,
    // then the plan update and audit log ran as independent writes
    // after it - so a crash between the claim and the plan update left
    // the request permanently "approved" (the pending-status guard
    // makes it un-retriable) with the user's plan never actually
    // changed, and no way to detect or recover that short of a manual
    // database fix. A shared transaction makes the whole operation
    // all-or-nothing: if anything after the claim fails, the claim
    // itself rolls back too, so the exact same request can simply be
    // retried and will succeed cleanly instead of being silently stuck
    // half-done. The compare-and-swap on `status: "pending"` inside the
    // claim still guarantees only one of two concurrent approvals (a
    // double-click, two admin tabs) can win.
    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.upgradeRequest.updateMany({
        where: { id: requestId, status: "pending" },
        data: {
          status: "approved",
          approvedBy: session.user.id,
          approvedAt: new Date(),
        },
      });
      if (claimed.count === 0) return null;

      await tx.user.update({
        where: { id: request.userId },
        data: { plan: request.requestedPlan },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.user.id,
          actorUsername: session.user.username ?? null,
          action: "upgrade_request.approve",
          targetType: "UpgradeRequest",
          targetId: requestId,
          metadata: { userId: request.userId, plan: request.requestedPlan },
        },
      });

      return true;
    });

    if (!result) {
      return NextResponse.json(
        { error: "Request already processed" },
        { status: 409 }
      );
    }

    invalidateUserAuthState(request.userId);

    return NextResponse.json({ success: true, message: "Plan upgraded." });
  } else if (action === "deny") {
    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.upgradeRequest.updateMany({
        where: { id: requestId, status: "pending" },
        data: {
          status: "denied",
          approvedBy: session.user.id,
          approvedAt: new Date(),
        },
      });
      if (claimed.count === 0) return null;

      await tx.auditLog.create({
        data: {
          actorId: session.user.id,
          actorUsername: session.user.username ?? null,
          action: "upgrade_request.deny",
          targetType: "UpgradeRequest",
          targetId: requestId,
          metadata: { userId: request.userId, plan: request.requestedPlan },
        },
      });

      return true;
    });

    if (!result) {
      return NextResponse.json(
        { error: "Request already processed" },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true, message: "Request denied." });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
