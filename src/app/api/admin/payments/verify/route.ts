import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { invalidateUserAuthState } from "@/lib/auth-state";
import { logAdminAction } from "@/lib/audit-log";

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

  // ⚠️ Claim the payment first via a conditional update - the same
  // compare-and-swap pattern the withdrawal approval route uses.
  // Without it, two concurrent verifications of the same paymentId both
  // pass the `status !== "pending"` check above and both apply the plan
  // change and audit-log write. Only one caller can win this update.
  const claimed = await prisma.paymentRequest.updateMany({
    where: { id: paymentId, status: "pending" },
    data: { status: "verified" },
  });

  if (claimed.count === 0) {
    return NextResponse.json({ error: "Payment already processed" }, { status: 409 });
  }

  // Upgrade the user's plan
  await prisma.user.update({
    where: { id: payment.userId },
    data: { plan: payment.plan },
  });
  invalidateUserAuthState(payment.userId);

  await logAdminAction({
    actor: adminCheck.session,
    action: "payment.verify",
    targetType: "PaymentRequest",
    targetId: paymentId,
    metadata: { userId: payment.userId, plan: payment.plan },
  });

  return NextResponse.json({ success: true, message: `User upgraded to ${payment.plan}` });
}
