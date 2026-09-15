import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rejectNativePayment } from "@/lib/native-payment-policy.server";
import { getPlanPrice, type BillingIntervalInput } from "@/lib/subscriptions";

const PAID_PLANS = ["pro", "business", "enterprise"] as const;
type Plan = (typeof PAID_PLANS)[number];

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The manual crypto plan-upgrade request is a store-sensitive payment
  // surface, blocked for the native app. See src/lib/native-payment-policy.ts.
  const nativeBlock = rejectNativePayment(req);
  if (nativeBlock) return nativeBlock;

  const { plan, transactionId, billingInterval } = await req.json();

  // Type guard: ensure plan is a valid key
  if (!plan || typeof plan !== "string" || !(PAID_PLANS as readonly string[]).includes(plan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const planKey = plan as Plan;

  // The client picks a duration (monthly/yearly - the only two ZRP
  // publishes, see PLANS.priceMonthly/priceYearly in lib/limits.ts), but
  // never the price: the amount charged is always looked up server-side
  // from that same table, never trusted from the request body.
  const interval: BillingIntervalInput = billingInterval === "yearly" ? "yearly" : "monthly";
  const amount = getPlanPrice(planKey, interval);

  if (!transactionId?.trim()) {
    return NextResponse.json({ error: "Transaction signature is required" }, { status: 400 });
  }

  // Check if user already has a pending request for this plan
  const existing = await prisma.paymentRequest.findFirst({
    where: {
      userId: session.user.id,
      plan: planKey,
      status: "pending",
    },
  });
  if (existing) {
    return NextResponse.json({ error: "You already have a pending request for this plan." }, { status: 400 });
  }

  await prisma.paymentRequest.create({
    data: {
      userId: session.user.id,
      plan: planKey,
      amount,
      currency: "USDC",
      billingInterval: interval,
      transactionId: transactionId.trim(),
      status: "pending",
    },
  });

  return NextResponse.json({
    success: true,
    message: "Payment request submitted. An admin will verify it within 24 hours.",
  });
}
