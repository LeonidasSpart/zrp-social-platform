import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
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

  const limit = await rateLimit(req, { limit: 10, window: 60, type: "payment-crypto" });
  if (!limit.success) return limit.response;

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

  if (typeof transactionId !== "string" || !transactionId.trim()) {
    return NextResponse.json({ error: "Transaction signature is required" }, { status: 400 });
  }
  const signature = transactionId.trim();

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

  // ⚠️ SECURITY: a plan payment's signature joins the same
  // one-signature-one-payment ledger as tips, premium purchases, HELP
  // contributions and ad campaigns (ConsumedPaymentTransaction, see
  // schema.prisma). Before, plan payments were outside it entirely: the
  // same on-chain transfer could be submitted here (and verified by an
  // admin, who sees a real transfer of the right amount) AND claimed as
  // a tip to the payer's own creator alt - or two users could submit the
  // same signature here - crediting one real payment twice. The claim
  // is inserted in the same transaction as the PaymentRequest, so it is
  // race-proof across every payment route.
  const existingClaim = await prisma.consumedPaymentTransaction.findUnique({
    where: { transactionId: signature },
  });
  if (existingClaim) {
    return NextResponse.json({ error: "This transaction has already been used for a payment." }, { status: 409 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const request = await tx.paymentRequest.create({
        data: {
          userId: session.user.id,
          plan: planKey,
          amount,
          currency: "USDC",
          billingInterval: interval,
          transactionId: signature,
          status: "pending",
        },
      });
      await tx.consumedPaymentTransaction.create({
        data: { transactionId: signature, paymentType: "plan_payment", paymentId: request.id },
      });
    });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "This transaction has already been used for a payment." }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json({
    success: true,
    message: "Payment request submitted. An admin will verify it within 24 hours.",
  });
}
