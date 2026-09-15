import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { jsonWithDecimals } from "@/lib/serialize-decimal";
import { Prisma } from "@prisma/client";

// Admin > Subscriptions & Billing - list + overview (Step 7). Server-side
// search, filters, sort and pagination throughout: this table can grow to
// every paying user on the platform, so nothing here ever loads the full
// set into the browser.
export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const params = req.nextUrl.searchParams;
  const search = (params.get("search") || "").trim();
  const page = Math.max(1, parseInt(params.get("page") || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(params.get("limit") || "25", 10) || 25));
  const planFilter = params.get("plan") || "ALL";
  const statusFilter = params.get("status") || "ALL";
  const intervalFilter = params.get("interval") || "ALL";
  const paymentMethodFilter = params.get("paymentMethod") || "ALL";
  const expiringWithin = params.get("expiringWithin"); // "7" | "30"
  const sort = params.get("sort") || "expiration"; // "expiration" | "lastPayment" | "createdAt"
  const order = params.get("order") === "asc" ? "asc" : "desc";

  const now = new Date();

  const where: Prisma.SubscriptionWhereInput = {};
  if (planFilter !== "ALL") where.plan = planFilter;
  if (statusFilter !== "ALL") where.status = statusFilter as Prisma.SubscriptionWhereInput["status"];
  if (intervalFilter !== "ALL") where.billingInterval = intervalFilter as Prisma.SubscriptionWhereInput["billingInterval"];
  if (paymentMethodFilter !== "ALL") where.payments = { some: { paymentMethod: paymentMethodFilter } };
  if (expiringWithin) {
    const days = parseInt(expiringWithin, 10);
    if (!Number.isNaN(days) && days > 0) {
      where.status = "ACTIVE";
      where.currentPeriodEnd = { gt: now, lte: new Date(now.getTime() + days * 24 * 60 * 60 * 1000) };
    }
  }
  if (search) {
    where.user = {
      OR: [
        { username: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ],
    };
  }

  const orderBy: Prisma.SubscriptionOrderByWithRelationInput =
    sort === "lastPayment"
      ? { lastPaymentAt: order }
      : sort === "createdAt"
        ? { createdAt: order }
        : { currentPeriodEnd: order };

  const [rows, total] = await Promise.all([
    prisma.subscription.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: { select: { id: true, username: true, email: true, name: true, plan: true, badgeType: true } },
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    prisma.subscription.count({ where }),
  ]);

  // Overview counts - always computed over the FULL table (no filters),
  // matching the existing admin/users convention of stable stat cards
  // independent of whatever the table below happens to be filtered to.
  const [byStatus, expiring7, expiring30, failedPayments, paidUserCount, freeUserCount, revenueRows] =
    await Promise.all([
      prisma.subscription.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.subscription.count({
        where: { status: "ACTIVE", currentPeriodEnd: { gt: now, lte: new Date(now.getTime() + 7 * 86400000) } },
      }),
      prisma.subscription.count({
        where: { status: "ACTIVE", currentPeriodEnd: { gt: now, lte: new Date(now.getTime() + 30 * 86400000) } },
      }),
      prisma.paymentRequest.count({ where: { status: "rejected" } }),
      prisma.user.count({ where: { plan: { not: "free" } } }),
      prisma.user.count({ where: { plan: "free" } }),
      prisma.subscriptionPayment.groupBy({
        by: ["plan", "billingInterval"],
        _sum: { amount: true },
        _count: { _all: true },
        where: { paymentMethod: { not: "admin_grant" } },
      }),
    ]);

  const statusCounts: Record<string, number> = {};
  for (const row of byStatus) statusCounts[row.status] = row._count._all;

  const revenueByPlan = revenueRows.map((r) => ({
    plan: r.plan,
    billingInterval: r.billingInterval,
    totalAmount: r._sum.amount ? r._sum.amount.toNumber() : 0,
    count: r._count._all,
  }));

  return jsonWithDecimals({
    overview: {
      active: statusCounts.ACTIVE || 0,
      expired: statusCounts.EXPIRED || 0,
      canceled: statusCounts.CANCELED || 0,
      pending: statusCounts.PENDING || 0,
      expiringWithin7Days: expiring7,
      expiringWithin30Days: expiring30,
      failedPayments,
      paidUsers: paidUserCount,
      freeUsers: freeUserCount,
      revenueByPlan,
      // Revenue totals reflect only what this system can actually see:
      // SubscriptionPayment rows created from here on (plus the
      // historical backfill, which carries amount 0 and is excluded via
      // paymentMethod above since it represents no real money moved).
      // Revenue from payments verified before this feature existed is
      // NOT retroactively reconstructed here and is not represented in
      // this total - see docs/subscriptions.md.
      revenueDataAvailableSince: "this feature's launch (payments verified before it are not included above)",
    },
    subscriptions: rows.map((s) => ({
      id: s.id,
      userId: s.userId,
      user: s.user,
      plan: s.plan,
      status: s.status,
      billingInterval: s.billingInterval,
      currentPeriodStart: s.currentPeriodStart,
      currentPeriodEnd: s.currentPeriodEnd,
      nextBillingAt: s.nextBillingAt,
      daysRemaining: s.currentPeriodEnd
        ? Math.max(0, Math.ceil((s.currentPeriodEnd.getTime() - now.getTime()) / 86400000))
        : null,
      canceledAt: s.canceledAt,
      expiredAt: s.expiredAt,
      lastPaymentAt: s.lastPaymentAt,
      reminderSentAt: s.reminderSentAt,
      isLegacyBackfill: s.isLegacyBackfill,
      createdAt: s.createdAt,
      lastPayment: s.payments[0] || null,
    })),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
}
