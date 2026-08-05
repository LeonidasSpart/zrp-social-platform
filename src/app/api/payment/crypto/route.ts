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

  const { plan } = await req.json();
  if (!PLANS[plan]) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  // Store a pending payment request
  const payment = await prisma.paymentRequest.create({
    data: {
      userId: session.user.id,
      plan,
      amount: PLANS[plan].amount,
      currency: "USDC",
      status: "pending",
    },
  });

  return NextResponse.json({
    paymentId: payment.id,
    walletAddress: process.env.SOLANA_WALLET_ADDRESS,
    amount: PLANS[plan].amount,
    plan,
  });
}
