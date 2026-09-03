import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rejectNativePayment } from "@/lib/native-payment-policy.server";

const PLANS = {
  pro: { amount: 9.99, label: "Pro" },
  business: { amount: 49.99, label: "Business" },
  enterprise: { amount: 99.99, label: "Enterprise" },
} as const;

type Plan = keyof typeof PLANS;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The manual crypto plan-upgrade request is a store-sensitive payment
  // surface, blocked for the native app. See src/lib/native-payment-policy.ts.
  const nativeBlock = rejectNativePayment(req);
  if (nativeBlock) return nativeBlock;

  const { plan, transactionId } = await req.json();

  // Type guard: ensure plan is a valid key
  if (!plan || typeof plan !== "string" || !(plan in PLANS)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const planKey = plan as Plan;

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

  const payment = await prisma.paymentRequest.create({
    data: {
      userId: session.user.id,
      plan: planKey,
      amount: PLANS[planKey].amount,
      currency: "USDC",
      transactionId: transactionId.trim(),
      status: "pending",
    },
  });

  return NextResponse.json({
    success: true,
    message: "Payment request submitted. An admin will verify it within 24 hours.",
  });
}
