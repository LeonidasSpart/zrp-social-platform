import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { jsonWithDecimals } from "@/lib/serialize-decimal";
import { Prisma } from "@prisma/client";

// Admin > Subscriptions & Billing - list + overview.
//
// ROOT-CAUSE FIX (see docs/subscriptions.md "Admin dashboard: querying
// from User, not Subscription"): this used to `prisma.subscription.findMany`
// as the base query. A `Subscription` row only exists for a user once they
// have gone through the NEW payment/grant/backfill path - a free user, or
// a legacy-paid user whose entitlement has never been reconciled into this
// table (see `scripts/backfill-subscriptions.ts`, which is a manual,
// one-time operator step, not something that runs automatically), simply
// has no row there at all. Meanwhile the KPI counters were computed
// separately from `User.plan`. The result: real, correct-looking KPI
// numbers ("49 paid users") next to a search/filter table that could only
// ever surface the subset of users who happen to already have a
// Subscription row - which, before the backfill script is actually run in
// production, can be few or none. Searching for a real user, or filtering
// to "Business", would silently come back empty even though the user
// genuinely exists and genuinely has that plan.
//
// The fix: the base query is now `prisma.user.findMany` with `subscription`
// as an optional include/filter, so every user is reachable - with or
// without a Subscription row - and every filter/KPI pair is defined by the
// exact same `buildPopulationWhere()` below, so a KPI's count and its
// filtered list's total can never disagree (the dashboard's own acceptance
// test: PAID KPI count === clicking PAID's resulting list total).
export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const params = req.nextUrl.searchParams;
  const search = (params.get("search") || "").trim();
  const page = Math.max(1, parseInt(params.get("page") || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(params.get("limit") || "25", 10) || 25));
  const planFilter = params.get("plan") || "ALL";
  // Real Subscription statuses (ACTIVE/EXPIRED/CANCELED/PENDING) plus three
  // synthetic population values that don't map to a single Subscription
  // status: PAID (currently entitled - mirrors what the app itself
  // enforces via User.plan), FREE (currently not entitled, whatever the
  // history), and NO_SUBSCRIPTION (paid per User.plan but with no
  // Subscription row yet - the "needs reconciliation" bucket from
  // docs/subscriptions.md "Existing users").
  const statusFilter = params.get("status") || "ALL";
  const intervalFilter = params.get("interval") || "ALL";
  const paymentMethodFilter = params.get("paymentMethod") || "ALL";
  const expiringWithin = params.get("expiringWithin"); // "7" | "30"
  const sort = params.get("sort") || "expiration"; // "expiration" | "lastPayment" | "createdAt"
  const order = params.get("order") === "asc" ? "asc" : "desc";

  const now = new Date();
  const REAL_STATUSES = new Set(["ACTIVE", "EXPIRED", "CANCELED", "PENDING"]);

  function expiringSubscriptionWhere(days: number): Prisma.SubscriptionWhereInput {
    return { status: "ACTIVE", currentPeriodEnd: { gt: now, lte: new Date(now.getTime() + days * 86400000) } };
  }

  // The single definition every KPI count and every filtered list share -
  // this is what makes KPI/list disagreement structurally impossible
  // rather than something that has to be kept in sync by hand.
  function buildPopulationWhere(status: string, expiringDays: number | null): Prisma.UserWhereInput {
    if (expiringDays) {
      // "Expiring" only makes sense against an active period; combine with
      // an explicit status if one was also given, otherwise it implies ACTIVE.
      return { subscription: expiringSubscriptionWhere(expiringDays) };
    }
    if (REAL_STATUSES.has(status)) {
      return { subscription: { status: status as Prisma.SubscriptionWhereInput["status"] } };
    }
    switch (status) {
      case "PAID":
        // Matches what the app actually grants access on today (User.plan
        // remains the live feature-gate - see CLAUDE.md "Source of truth").
        return { plan: { not: "free" } };
      case "FREE":
        return { plan: "free" };
      case "NO_SUBSCRIPTION":
        // Paid per the legacy/compatibility plan field, but with no
        // authoritative Subscription row - needs backfill/reconciliation,
        // and must never be silently folded into "free" (docs/subscriptions.md).
        return { plan: { not: "free" }, subscription: null };
      default:
        return {};
    }
  }

  const clauses: Prisma.UserWhereInput[] = [];
  if (search) {
    clauses.push({
      OR: [
        { username: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  const expiringDays = expiringWithin ? parseInt(expiringWithin, 10) : null;
  const populationWhere = buildPopulationWhere(statusFilter, expiringDays && expiringDays > 0 ? expiringDays : null);
  if (Object.keys(populationWhere).length > 0) clauses.push(populationWhere);

  if (planFilter !== "ALL") {
    if (planFilter === "free") {
      clauses.push({ plan: "free" });
    } else {
      // A real subscription on this plan, OR a legacy user whose
      // compatibility plan field says this plan but has no Subscription
      // row yet - both are genuinely "on the business plan" from the
      // admin's point of view, and hiding the second group is exactly the
      // bug this route used to have.
      clauses.push({
        OR: [{ subscription: { plan: planFilter } }, { plan: planFilter, subscription: null }],
      });
    }
  }
  if (intervalFilter !== "ALL") {
    clauses.push({ subscription: { billingInterval: intervalFilter as Prisma.SubscriptionWhereInput["billingInterval"] } });
  }
  if (paymentMethodFilter !== "ALL") {
    clauses.push({ subscription: { payments: { some: { paymentMethod: paymentMethodFilter } } } });
  }

  const where: Prisma.UserWhereInput = clauses.length > 0 ? { AND: clauses } : {};

  const orderBy: Prisma.UserOrderByWithRelationInput =
    sort === "lastPayment"
      ? { subscription: { lastPaymentAt: order } }
      : sort === "createdAt"
        ? { createdAt: order }
        : { subscription: { currentPeriodEnd: order } };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        plan: true,
        badgeType: true,
        avatarUrl: true,
        subscription: {
          include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  // Overview counts - always computed over the FULL table (no filters),
  // matching the existing admin/users convention of stable stat cards
  // independent of whatever the table below happens to be filtered to.
  // Every one of these reuses buildPopulationWhere() so it is provably the
  // same query a click on that KPI will run.
  const [
    active,
    expired,
    canceled,
    pending,
    expiringWithin7Days,
    expiringWithin30Days,
    failedPayments,
    paidUsers,
    freeUsers,
    needsReconciliation,
    revenueRows,
  ] = await Promise.all([
    prisma.user.count({ where: buildPopulationWhere("ACTIVE", null) }),
    prisma.user.count({ where: buildPopulationWhere("EXPIRED", null) }),
    prisma.user.count({ where: buildPopulationWhere("CANCELED", null) }),
    prisma.user.count({ where: buildPopulationWhere("PENDING", null) }),
    prisma.user.count({ where: buildPopulationWhere("ACTIVE", 7) }),
    prisma.user.count({ where: buildPopulationWhere("ACTIVE", 30) }),
    prisma.paymentRequest.count({ where: { status: "rejected" } }),
    prisma.user.count({ where: buildPopulationWhere("PAID", null) }),
    prisma.user.count({ where: buildPopulationWhere("FREE", null) }),
    prisma.user.count({ where: buildPopulationWhere("NO_SUBSCRIPTION", null) }),
    prisma.subscriptionPayment.groupBy({
      by: ["plan", "billingInterval"],
      _sum: { amount: true },
      _count: { _all: true },
      where: { paymentMethod: { not: "admin_grant" } },
    }),
  ]);

  const revenueByPlan = revenueRows.map((r) => ({
    plan: r.plan,
    billingInterval: r.billingInterval,
    totalAmount: r._sum.amount ? r._sum.amount.toNumber() : 0,
    count: r._count._all,
  }));

  return jsonWithDecimals({
    overview: {
      active,
      expired,
      canceled,
      pending,
      expiringWithin7Days,
      expiringWithin30Days,
      failedPayments,
      paidUsers,
      freeUsers,
      needsReconciliation,
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
    subscriptions: users.map((u) => {
      const s = u.subscription;
      return {
        id: s?.id ?? null,
        userId: u.id,
        user: { id: u.id, username: u.username, email: u.email, name: u.name, plan: u.plan, badgeType: u.badgeType, avatarUrl: u.avatarUrl },
        plan: s?.plan ?? u.plan,
        status: s?.status ?? (u.plan !== "free" ? "NO_SUBSCRIPTION" : "FREE"),
        billingInterval: s?.billingInterval ?? null,
        currentPeriodStart: s?.currentPeriodStart ?? null,
        currentPeriodEnd: s?.currentPeriodEnd ?? null,
        nextBillingAt: s?.nextBillingAt ?? null,
        daysRemaining: s?.currentPeriodEnd
          ? Math.max(0, Math.ceil((s.currentPeriodEnd.getTime() - now.getTime()) / 86400000))
          : null,
        canceledAt: s?.canceledAt ?? null,
        expiredAt: s?.expiredAt ?? null,
        lastPaymentAt: s?.lastPaymentAt ?? null,
        reminderSentAt: s?.reminderSentAt ?? null,
        isLegacyBackfill: s?.isLegacyBackfill ?? false,
        needsReconciliation: !s && u.plan !== "free",
        createdAt: s?.createdAt ?? null,
        lastPayment: s?.payments[0] || null,
      };
    }),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
}
