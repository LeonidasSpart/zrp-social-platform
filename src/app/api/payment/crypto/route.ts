import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const PLANS = {
  pro: { amount: 9.99, label: "Pro" },
  business: { amount: 49.99, label: "Business" },
  enterprise: { amount: 99.99, label: "Enterprise" },
};

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { plan, transactionId } = await req.json();
  if (!PLANS[plan]) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }
  if (!transactionId?.trim()) {
    return NextResponse.json({ error: "Transaction signature is required" }, { status: 400 });
  }

  // Check if user already has a pending request for this plan
  const existing = await prisma.paymentRequest.findFirst({
    where: {
      userId: session.user.id,
      plan,
      status: "pending",
    },
  });
  if (existing) {
    return NextResponse.json({ error: "You already have a pending request for this plan." }, { status: 400 });
  }

  const payment = await prisma.paymentRequest.create({
    data: {
      userId: session.user.id,
      plan,
      amount: PLANS[plan].amount,
      currency: "USDC",
      transactionId: transactionId.trim(),
      status: "pending",
    },
  });

  // Notify admins (optional – you can add an email or in-app notification)

  return NextResponse.json({
    success: true,
    message: "Payment request submitted. An admin will verify it within 24 hours.",
  });
}
