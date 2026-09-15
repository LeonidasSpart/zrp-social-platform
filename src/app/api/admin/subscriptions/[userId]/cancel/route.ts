import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { adminCancelSubscription } from "@/lib/subscriptions";

// Admin control: cancel a user's remaining paid time immediately (e.g.
// chargeback, abuse, a refund honored outside the platform). Idempotent:
// calling this on an already-CANCELED/EXPIRED/PENDING subscription is a
// safe no-op (adminCancelSubscription only claims an ACTIVE row).
export async function POST(req: NextRequest, props: { params: Promise<{ userId: string }> }) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;
  const { userId } = await props.params;
  const body = await req.json().catch(() => ({}));
  const reason = typeof body?.reason === "string" ? body.reason.slice(0, 500) : undefined;

  const subscriptionId = await adminCancelSubscription({
    userId,
    actorId: adminCheck.session.user.id,
    actorUsername: adminCheck.session.user.username ?? null,
    reason,
  });

  if (!subscriptionId) {
    return NextResponse.json({ error: "No active subscription to cancel" }, { status: 409 });
  }

  await prisma.auditLog.create({
    data: {
      actorId: adminCheck.session.user.id,
      actorUsername: adminCheck.session.user.username ?? null,
      action: "subscription.cancel",
      targetType: "User",
      targetId: userId,
      metadata: { subscriptionId, reason },
    },
  });

  return NextResponse.json({ success: true, subscriptionId });
}
