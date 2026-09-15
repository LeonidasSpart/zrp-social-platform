import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { jsonWithDecimals } from "@/lib/serialize-decimal";

// Per-user billing detail (Step 7): current plan/status/period, full
// payment history, renewal/lifecycle history and reminder history - all
// sourced from Subscription + SubscriptionPayment + SubscriptionEvent,
// the same authoritative tables the list route reads.
export async function GET(_req: NextRequest, props: { params: Promise<{ userId: string }> }) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;
  const { userId } = await props.params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, email: true, name: true, plan: true, badgeType: true, createdAt: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    include: {
      payments: { orderBy: { createdAt: "desc" } },
      events: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });

  // Legacy manual-payment history that predates (or bypasses, e.g. a
  // still-pending request) the Subscription system, shown for full
  // context even though it's no longer what grants entitlement.
  const [paymentRequests, upgradeRequests] = await Promise.all([
    prisma.paymentRequest.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.upgradeRequest.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
  ]);

  const now = new Date();
  return jsonWithDecimals({
    user,
    subscription: subscription
      ? {
          ...subscription,
          daysRemaining: subscription.currentPeriodEnd
            ? Math.max(0, Math.ceil((subscription.currentPeriodEnd.getTime() - now.getTime()) / 86400000))
            : null,
        }
      : null,
    legacyPaymentRequests: paymentRequests,
    legacyUpgradeRequests: upgradeRequests,
  });
}
