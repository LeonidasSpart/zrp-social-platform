import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { invalidateUserAuthState } from "@/lib/auth-state";
import { applyVerifiedPayment, toBillingIntervalEnum } from "@/lib/subscriptions";
import type { Plan } from "@/lib/limits";

export async function POST(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const { paymentId } = await req.json();

  const payment = await prisma.paymentRequest.findUnique({
    where: { id: paymentId },
    include: { user: true },
  });

  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  if (payment.status !== "pending") {
    return NextResponse.json({ error: "Payment already processed" }, { status: 400 });
  }

  // ⚠️ The claim (updateMany), the plan upgrade, and the audit log all
  // happen inside ONE transaction rather than as separate sequential
  // awaits. Previously the claim committed on its own, then the plan
  // update and audit log ran as independent writes after it - so a
  // crash between the claim and the plan update left the request
  // permanently "verified" (the pending-status guard makes it
  // un-retriable) with the user's plan never actually changed, and no
  // way to detect or recover that short of a manual database fix. A
  // shared transaction makes the whole operation all-or-nothing: if
  // anything after the claim fails, the claim itself rolls back too, so
  // the exact same request can simply be retried and will succeed
  // cleanly instead of being silently stuck half-done.
  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.paymentRequest.updateMany({
      where: { id: paymentId, status: "pending" },
      data: { status: "verified" },
    });
    if (claimed.count === 0) return null;

    // Grants/extends the authoritative, time-bounded Subscription period
    // (and, inside that same call, writes User.plan) - see
    // src/lib/subscriptions.ts. The SubscriptionPayment unique constraint
    // on paymentRequestId is a second, independent guard on top of the
    // updateMany claim above: even if this route were ever invoked twice
    // for the same already-claimed payment, this insert would fail the
    // unique constraint rather than silently granting a second period.
    await applyVerifiedPayment(tx, {
      userId: payment.userId,
      plan: payment.plan as Plan,
      billingInterval: toBillingIntervalEnum(payment.billingInterval ?? "monthly"),
      amount: payment.amount.toString(),
      currency: payment.currency,
      paymentMethod: "crypto",
      source: { type: "payment_request", id: payment.id },
      actorId: adminCheck.session.user.id,
      actorUsername: adminCheck.session.user.username ?? null,
    });

    await tx.auditLog.create({
      data: {
        actorId: adminCheck.session.user.id,
        actorUsername: adminCheck.session.user.username ?? null,
        action: "payment.verify",
        targetType: "PaymentRequest",
        targetId: paymentId,
        metadata: { userId: payment.userId, plan: payment.plan },
      },
    });

    return true;
  });

  if (!result) {
    return NextResponse.json({ error: "Payment already processed" }, { status: 409 });
  }

  invalidateUserAuthState(payment.userId);

  return NextResponse.json({ success: true, message: `User upgraded to ${payment.plan}` });
}
