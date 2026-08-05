import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

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

  // Upgrade the user's plan
  await prisma.user.update({
    where: { id: payment.userId },
    data: { plan: payment.plan },
  });

  await prisma.paymentRequest.update({
    where: { id: paymentId },
    data: { status: "verified" },
  });

  return NextResponse.json({ success: true, message: `User upgraded to ${payment.plan}` });
}
