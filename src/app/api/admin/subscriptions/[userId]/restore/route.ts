import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { adminRestoreSubscription } from "@/lib/subscriptions";

// Admin control: undo an admin cancellation while time remains on the
// period. Idempotent: only claims a CANCELED row with a still-future
// currentPeriodEnd, so calling it twice or on an already-restored/
// expired subscription is a safe no-op.
export async function POST(_req: NextRequest, props: { params: Promise<{ userId: string }> }) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;
  const { userId } = await props.params;

  const subscriptionId = await adminRestoreSubscription({
    userId,
    actorId: adminCheck.session.user.id,
    actorUsername: adminCheck.session.user.username ?? null,
  });

  if (!subscriptionId) {
    return NextResponse.json(
      { error: "No canceled subscription with remaining time to restore" },
      { status: 409 }
    );
  }

  await prisma.auditLog.create({
    data: {
      actorId: adminCheck.session.user.id,
      actorUsername: adminCheck.session.user.username ?? null,
      action: "subscription.restore",
      targetType: "User",
      targetId: userId,
      metadata: { subscriptionId },
    },
  });

  return NextResponse.json({ success: true, subscriptionId });
}
