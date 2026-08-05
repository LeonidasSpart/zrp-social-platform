import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// ─── POST: Create an upgrade request ───────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { requestedPlan, paymentMethod, message } = await req.json();

  // Validate plan
  const validPlans = ["pro", "business", "enterprise"];
  if (!validPlans.includes(requestedPlan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  // Check if user already has a pending request for this plan
  const existing = await prisma.upgradeRequest.findFirst({
    where: {
      userId: session.user.id,
      requestedPlan,
      status: "pending",
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: "You already have a pending request for this plan." },
      { status: 400 }
    );
  }

  // Create request
  const request = await prisma.upgradeRequest.create({
    data: {
      userId: session.user.id,
      requestedPlan,
      paymentMethod: paymentMethod || null,
      message: message || null,
      status: "pending",
    },
  });

  // ─── Optional: notify admins (email / in-app) ─────────────────────
  // You can add a notification or email here

  return NextResponse.json({ success: true, request });
}

// ─── GET: Fetch pending requests (admin only) ─────────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user is admin
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const statusFilter = req.nextUrl.searchParams.get("status") || "pending";
  const requests = await prisma.upgradeRequest.findMany({
    where: { status: statusFilter },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          name: true,
          email: true,
          plan: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(requests);
}
