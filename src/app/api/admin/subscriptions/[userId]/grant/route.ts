import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { adminGrantSubscription } from "@/lib/subscriptions";
import { invalidateUserAuthState } from "@/lib/auth-state";
import type { Plan } from "@/lib/limits";
import { PLANS } from "@/lib/limits";

const VALID_PLANS = Object.keys(PLANS) as Plan[];

// Admin control: manually grant/extend a subscription (e.g. goodwill
// credit, offline/bank payment, support resolution). Reuses the exact
// same extend-from-existing-period-end rule as a real payment. Idempotent
// per call via a fresh, server-generated adminGrantRef - a double-click
// or network retry with the SAME client-side action still only ever
// creates one grant, but this endpoint itself does not attempt to dedupe
// two intentionally separate admin grants (there is no meaningful
// "same grant" key between them), matching the fact this is a manual,
// human-authorized action each time it's invoked.
export async function POST(req: NextRequest, props: { params: Promise<{ userId: string }> }) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;
  const { userId } = await props.params;

  const body = await req.json().catch(() => ({}));
  const { plan, billingInterval } = body as { plan?: string; billingInterval?: string };

  if (!plan || !VALID_PLANS.includes(plan as Plan) || plan === "free") {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }
  const interval = billingInterval === "yearly" ? "yearly" : "monthly";

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, banned: true } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const result = await adminGrantSubscription({
    userId,
    plan: plan as Plan,
    billingInterval: interval,
    actorId: adminCheck.session.user.id,
    actorUsername: adminCheck.session.user.username ?? null,
    ref: `admin-grant-${randomUUID()}`,
  });
  // applyVerifiedPayment() wrote User.plan inside the transaction; the
  // cancel/restore helpers invalidate themselves, this path must too.
  invalidateUserAuthState(userId);

  await prisma.auditLog.create({
    data: {
      actorId: adminCheck.session.user.id,
      actorUsername: adminCheck.session.user.username ?? null,
      action: "subscription.grant",
      targetType: "User",
      targetId: userId,
      metadata: { plan, billingInterval: interval, subscriptionId: result.subscriptionId, periodEnd: result.periodEnd },
    },
  });

  return NextResponse.json({ success: true, subscriptionId: result.subscriptionId, periodEnd: result.periodEnd });
}
