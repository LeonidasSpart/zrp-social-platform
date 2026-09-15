import type { Prisma, PrismaClient, BillingInterval as PrismaBillingInterval, SubscriptionStatus } from "@prisma/client";
import { randomUUID } from "crypto";
import { prisma } from "./db";
import { getPlanLimits, type Plan } from "./limits";
import { invalidateUserAuthState } from "./auth-state";
import { sendPushNotification } from "./push-notifications";
import { sendEmail } from "./email";

// ─── Subscription lifecycle (single source of truth) ─────────────────
//
// This is the ONLY place that grants, extends, expires or cancels paid
// entitlement. `User.plan` stays around because dozens of existing call
// sites read it directly (limits.ts, permissions.ts, the JWT/session
// FeatureStatus cache), but from here on it is a denormalized display
// cache that is only ever written *alongside* a Subscription write, never
// on its own - see applyVerifiedPayment/expireDueSubscriptions/
// adminCancelSubscription/adminRestoreSubscription below, which are the
// only functions in this codebase allowed to write `User.plan` for a plan
// the user actually paid for. (Admin ban/moderation code that resets a
// plan for punitive reasons is a separate, pre-existing concern and is
// intentionally left alone.)
//
// ZRP has no auto-charging payment rail today - Solana/USDC payments are
// user-submitted and manually verified (PaymentRequest/UpgradeRequest).
// So "renewal" here always means "the user paid again", never a
// server-initiated charge. `nextBillingAt` is the date the user needs to
// pay again by, not a scheduled auto-charge job.

export type BillingIntervalInput = "monthly" | "yearly";

export function toBillingIntervalEnum(value: string): PrismaBillingInterval {
  const normalized = value.trim().toLowerCase();
  if (normalized === "yearly" || normalized === "annual") return "YEARLY";
  return "MONTHLY";
}

export function billingIntervalEnumToInput(value: PrismaBillingInterval | null | undefined): BillingIntervalInput {
  return value === "YEARLY" ? "yearly" : "monthly";
}

/**
 * The price a plan+interval combination costs, straight from PLANS in
 * limits.ts - the single existing source of plan pricing. Never derived
 * from client input. Falls back to the monthly price if a plan somehow
 * has no yearly price configured (matches getPlanLimits' own
 * free-plan-fallback conservatism).
 */
export function getPlanPrice(plan: string, interval: BillingIntervalInput): number {
  const limits = getPlanLimits(plan);
  if (interval === "yearly") {
    return limits.priceYearly ?? limits.priceMonthly ?? 0;
  }
  return limits.priceMonthly ?? 0;
}

// ─── Calendar-correct UTC date math ───────────────────────────────────
//
// Adding "1 month" or "1 year" naively with setMonth/setFullYear rolls
// over into the next month whenever the start day doesn't exist in the
// target month (e.g. Jan 31 + 1 month would silently become Mar 3, not
// Feb 28/29). These clamp to the last real day of the target month
// instead, and operate entirely in UTC per the canonical-timezone rule.
export function addMonthsUtc(date: Date, months: number): Date {
  const day = date.getUTCDate();
  const base = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() + months,
    1,
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds()
  );
  const firstOfTargetMonth = new Date(base);
  const daysInTargetMonth = new Date(
    Date.UTC(firstOfTargetMonth.getUTCFullYear(), firstOfTargetMonth.getUTCMonth() + 1, 0)
  ).getUTCDate();
  firstOfTargetMonth.setUTCDate(Math.min(day, daysInTargetMonth));
  return firstOfTargetMonth;
}

export function addYearsUtc(date: Date, years: number): Date {
  return addMonthsUtc(date, years * 12);
}

export function computePeriodEnd(periodStart: Date, interval: PrismaBillingInterval): Date {
  return interval === "YEARLY" ? addYearsUtc(periodStart, 1) : addMonthsUtc(periodStart, 1);
}

function isUniqueConstraintError(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { code?: string }).code === "P2002";
}

type TxClient = Prisma.TransactionClient | PrismaClient;

export type PaymentSource =
  | { type: "payment_request"; id: string }
  | { type: "upgrade_request"; id: string }
  | { type: "admin_grant"; ref: string };

export interface ApplyVerifiedPaymentParams {
  userId: string;
  plan: Plan;
  billingInterval: PrismaBillingInterval;
  amount: number | string;
  currency?: string;
  paymentMethod: "crypto" | "manual" | "admin_grant" | "legacy_backfill";
  source: PaymentSource;
  actorId?: string | null;
  actorUsername?: string | null;
  now?: Date;
}

export interface ApplyVerifiedPaymentResult {
  duplicate: boolean;
  subscriptionId: string;
  periodStart: Date;
  periodEnd: Date;
  kind?: "created" | "renewed" | "extended" | "plan_changed";
}

/**
 * Grants or extends a user's paid period from a verified payment. MUST be
 * called inside the same `prisma.$transaction` that claims the underlying
 * PaymentRequest/UpgradeRequest row (the conditional-updateMany
 * compare-and-swap pattern used across this codebase's admin approval
 * routes) - that claim is what makes the *outer* action idempotent
 * end-to-end. The `SubscriptionPayment.paymentRequestId` /
 * `upgradeRequestId` / `adminGrantRef` unique constraint below is a
 * second, independent database-level guard: even if something upstream
 * ever called this twice for the same source, the second insert fails
 * the unique constraint and this function reports `duplicate: true`
 * instead of creating a second paid period.
 *
 * Extension rule (documented business rule, see docs/subscriptions.md):
 * if the user already has an ACTIVE subscription for the SAME plan whose
 * currentPeriodEnd is still in the future, the new period is appended
 * after the existing one ends (extend). Otherwise - no active period,
 * a lapsed subscription, or a plan change - a fresh period starts from
 * `now`. Plan changes are never prorated; this mirrors the existing
 * manual-payment model (no partial refunds/credits exist anywhere in
 * this codebase) and is called out explicitly rather than silently
 * assumed.
 */
export async function applyVerifiedPayment(
  tx: TxClient,
  params: ApplyVerifiedPaymentParams
): Promise<ApplyVerifiedPaymentResult> {
  const now = params.now ?? new Date();
  const currency = params.currency ?? "USDC";

  // Get-or-create, race-safe: two concurrent first-ever payments for the
  // same user (no Subscription row yet) can both see null from
  // findUnique and both attempt to create. A plain `create()` (and even
  // Prisma's upsert(), proven under concurrent load in testing) raises a
  // unique-constraint error on the loser - and in Postgres, once any
  // statement inside a transaction errors, that WHOLE transaction is
  // poisoned and every later statement fails too (there is no
  // catch-and-continue at the SQL level without an explicit SAVEPOINT).
  // A raw `INSERT ... ON CONFLICT (userId) DO NOTHING` never raises on
  // conflict - Postgres blocks it until the conflicting (winning)
  // transaction commits or rolls back, then either inserts or silently
  // no-ops - so the transaction is never poisoned and the subsequent
  // read always finds a committed row.
  let subscription = await tx.subscription.findUnique({ where: { userId: params.userId } });
  if (!subscription) {
    await tx.$executeRaw`
      INSERT INTO "Subscription" ("id", "userId", "plan", "status", "createdAt", "updatedAt")
      VALUES (${randomUUID()}, ${params.userId}, ${params.plan}, 'PENDING'::"SubscriptionStatus", now(), now())
      ON CONFLICT ("userId") DO NOTHING
    `;
    subscription = await tx.subscription.findUniqueOrThrow({ where: { userId: params.userId } });
  }

  const hasActiveSamePlanPeriod =
    subscription.status === "ACTIVE" &&
    subscription.plan === params.plan &&
    !!subscription.currentPeriodEnd &&
    subscription.currentPeriodEnd.getTime() > now.getTime();

  const periodStart = hasActiveSamePlanPeriod ? (subscription.currentPeriodEnd as Date) : now;
  const periodEnd = computePeriodEnd(periodStart, params.billingInterval);
  const isFreshPeriod = !hasActiveSamePlanPeriod;

  const sourceField =
    params.source.type === "payment_request"
      ? { paymentRequestId: params.source.id }
      : params.source.type === "upgrade_request"
        ? { upgradeRequestId: params.source.id }
        : { adminGrantRef: params.source.ref };

  // SAVEPOINT, not a bare try/catch: a Postgres transaction is poisoned
  // by ANY statement error - once the unique-constraint violation below
  // fires, every later statement in the same transaction (including the
  // caller's own AuditLog.create()) would fail too unless the failed
  // statement is rolled back to an explicit savepoint first. This is the
  // actual idempotency guard (see the doc comment above); the savepoint
  // is just what makes "catch the conflict and continue in the same
  // transaction" possible in Postgres at all.
  await tx.$executeRawUnsafe(`SAVEPOINT subscription_payment_guard`);
  try {
    await tx.subscriptionPayment.create({
      data: {
        subscriptionId: subscription.id,
        userId: params.userId,
        plan: params.plan,
        billingInterval: params.billingInterval,
        amount: params.amount,
        currency,
        paymentMethod: params.paymentMethod,
        periodStart,
        periodEnd,
        ...sourceField,
      },
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT subscription_payment_guard`);
      return {
        duplicate: true,
        subscriptionId: subscription.id,
        periodStart: subscription.currentPeriodStart ?? periodStart,
        periodEnd: subscription.currentPeriodEnd ?? periodEnd,
      };
    }
    throw err;
  }

  const kind: "created" | "renewed" | "extended" | "plan_changed" =
    subscription.status === "PENDING"
      ? "created"
      : !isFreshPeriod
        ? "extended"
        : subscription.plan !== params.plan
          ? "plan_changed"
          : "renewed";

  const prevState = {
    plan: subscription.plan,
    status: subscription.status,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
  };

  await tx.subscription.update({
    where: { id: subscription.id },
    data: {
      plan: params.plan,
      status: "ACTIVE",
      billingInterval: params.billingInterval,
      startedAt: subscription.startedAt ?? now,
      currentPeriodStart: isFreshPeriod ? periodStart : subscription.currentPeriodStart,
      currentPeriodEnd: periodEnd,
      nextBillingAt: periodEnd,
      canceledAt: null,
      expiredAt: null,
      lastPaymentAt: now,
      reminderSentAt: null,
    },
  });

  await tx.user.update({ where: { id: params.userId }, data: { plan: params.plan } });

  const newState = {
    plan: params.plan,
    status: "ACTIVE" as SubscriptionStatus,
    currentPeriodStart: isFreshPeriod ? periodStart : subscription.currentPeriodStart,
    currentPeriodEnd: periodEnd,
  };

  await tx.subscriptionEvent.create({
    data: {
      subscriptionId: subscription.id,
      userId: params.userId,
      action: "payment_verified",
      actorId: params.actorId ?? null,
      actorUsername: params.actorUsername ?? null,
      metadata: {
        amount: String(params.amount),
        currency,
        paymentMethod: params.paymentMethod,
        billingInterval: params.billingInterval,
        source: params.source,
      },
    },
  });

  await tx.subscriptionEvent.create({
    data: {
      subscriptionId: subscription.id,
      userId: params.userId,
      action: `subscription_${kind}`,
      actorId: params.actorId ?? null,
      actorUsername: params.actorUsername ?? null,
      prevState,
      newState,
    },
  });

  // periodStart/periodEnd here describe the sub-period THIS call granted
  // (matching the SubscriptionPayment row above) - Feb 1 -> Mar 1 for a
  // monthly extension granted while an existing period runs to Feb 1, not
  // the subscription's overall, unmoved currentPeriodStart. Callers that
  // need the overall continuous-period start should read it from the
  // Subscription row itself (subscription.currentPeriodStart).
  return { duplicate: false, subscriptionId: subscription.id, periodStart, periodEnd, kind };
}

/**
 * Idempotent, concurrency-safe expiration sweep. Each candidate is
 * claimed with its own conditional `updateMany` (status guard) inside its
 * own transaction, so two Railway instances (or one instance's cron
 * firing twice) running this at the same moment can never both "win" the
 * same subscription - the loser's claim simply matches zero rows and is
 * skipped. No read-then-write anywhere in the hot path.
 */
export async function expireDueSubscriptions(now: Date = new Date()) {
  const candidates = await prisma.subscription.findMany({
    where: { status: "ACTIVE", currentPeriodEnd: { lt: now } },
    select: { id: true, userId: true, plan: true, currentPeriodEnd: true },
  });

  let expiredCount = 0;
  for (const candidate of candidates) {
    const expired = await prisma.$transaction(async (tx) => {
      const claim = await tx.subscription.updateMany({
        where: { id: candidate.id, status: "ACTIVE", currentPeriodEnd: { lt: now } },
        data: { status: "EXPIRED", expiredAt: now, nextBillingAt: null },
      });
      if (claim.count === 0) return false;

      await tx.user.update({ where: { id: candidate.userId }, data: { plan: "free" } });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: candidate.id,
          userId: candidate.userId,
          action: "subscription_expired",
          prevState: { plan: candidate.plan, status: "ACTIVE", currentPeriodEnd: candidate.currentPeriodEnd },
          newState: { plan: "free", status: "EXPIRED" },
        },
      });

      return true;
    });

    if (expired) {
      expiredCount++;
      invalidateUserAuthState(candidate.userId);
    }
  }

  return { checked: candidates.length, expired: expiredCount };
}

/**
 * Sends the J-7 renewal reminder for every ACTIVE subscription entering
 * its last 7 days that hasn't been reminded for its CURRENT period yet.
 * `reminderSentAt` is claimed (conditional updateMany, same pattern as
 * expiration above) BEFORE attempting delivery, not after - so a push/
 * email failure can never cause a duplicate reminder on the next worker
 * run. The documented tradeoff (see docs/subscriptions.md) is that a
 * transient delivery failure is at-most-once, not retried: this
 * prioritizes the "exactly one reminder per period" guarantee, which is
 * the actual requirement, over guaranteed delivery, which no email/push
 * provider offers anyway. Financial fields (plan/status/period dates) are
 * never touched by this function regardless of delivery outcome.
 */
export async function sendJ7Reminders(now: Date = new Date(), windowDays = 7) {
  const windowEnd = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

  const candidates = await prisma.subscription.findMany({
    where: {
      status: "ACTIVE",
      reminderSentAt: null,
      currentPeriodEnd: { gt: now, lte: windowEnd },
    },
    include: {
      user: { select: { id: true, email: true, username: true, name: true } },
    },
  });

  let sent = 0;
  let alreadyClaimed = 0;
  for (const sub of candidates) {
    const claim = await prisma.subscription.updateMany({
      where: { id: sub.id, reminderSentAt: null, status: "ACTIVE" },
      data: { reminderSentAt: now },
    });
    if (claim.count === 0) {
      alreadyClaimed++;
      continue;
    }

    const periodEndLabel = (sub.currentPeriodEnd ?? windowEnd).toISOString().slice(0, 10);
    const title = "Your ZRP plan renews soon";
    const body = `Your ${sub.plan} plan ends on ${periodEndLabel}. Renew to keep your benefits.`;

    let pushOk = true;
    try {
      await sendPushNotification(sub.userId, title, body, "/settings/billing");
    } catch (err) {
      pushOk = false;
      console.error("J-7 reminder push failed:", err);
    }

    let emailOk = true;
    try {
      if (sub.user.email) {
        await sendEmail({
          to: sub.user.email,
          subject: title,
          html: `<p>Hi ${sub.user.name || sub.user.username},</p><p>${body}</p>`,
        });
      }
    } catch (err) {
      emailOk = false;
      console.error("J-7 reminder email failed:", err);
    }

    await prisma.subscriptionEvent.create({
      data: {
        subscriptionId: sub.id,
        userId: sub.userId,
        action: pushOk || emailOk ? "reminder_sent" : "reminder_failed",
        metadata: { periodEnd: sub.currentPeriodEnd, pushOk, emailOk },
      },
    });

    sent++;
  }

  return { checked: candidates.length, sent, alreadyClaimed };
}

export interface AdminGrantParams {
  userId: string;
  plan: Plan;
  billingInterval: BillingIntervalInput;
  actorId: string;
  actorUsername?: string | null;
  ref: string; // caller-supplied idempotency key, e.g. a client-generated request id
  now?: Date;
}

/** Admin "grant/extend a subscription" control (Step 7). Reuses the exact
 * same extension/idempotency machinery as a real payment, tagged with
 * paymentMethod "admin_grant" and amount 0 (no money actually moved) so it
 * shows up distinctly in billing history rather than posing as revenue. */
export async function adminGrantSubscription(params: AdminGrantParams) {
  return prisma.$transaction(async (tx) => {
    return applyVerifiedPayment(tx, {
      userId: params.userId,
      plan: params.plan,
      billingInterval: toBillingIntervalEnum(params.billingInterval),
      amount: 0,
      currency: "USDC",
      paymentMethod: "admin_grant",
      source: { type: "admin_grant", ref: params.ref },
      actorId: params.actorId,
      actorUsername: params.actorUsername,
      now: params.now,
    });
  });
}

export interface AdminCancelParams {
  userId: string;
  actorId: string;
  actorUsername?: string | null;
  reason?: string;
}

/** Admin "cancel" control: immediately revokes remaining paid time (e.g.
 * chargeback/abuse) rather than waiting for natural expiry. Distinct from
 * the expiration engine's `subscription_expired` action so admin-driven
 * revocations are never confused with a natural period lapse in the
 * audit log. */
export async function adminCancelSubscription(params: AdminCancelParams) {
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const subscription = await tx.subscription.findUnique({ where: { userId: params.userId } });
    if (!subscription || subscription.status !== "ACTIVE") return null;

    const claim = await tx.subscription.updateMany({
      where: { id: subscription.id, status: "ACTIVE" },
      data: { status: "CANCELED", canceledAt: now, nextBillingAt: null },
    });
    if (claim.count === 0) return null;

    await tx.user.update({ where: { id: params.userId }, data: { plan: "free" } });

    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: subscription.id,
        userId: params.userId,
        action: "subscription_canceled",
        actorId: params.actorId,
        actorUsername: params.actorUsername ?? null,
        prevState: { plan: subscription.plan, status: "ACTIVE" },
        newState: { plan: "free", status: "CANCELED" },
        metadata: params.reason ? { reason: params.reason } : undefined,
      },
    });

    return subscription.id;
  });

  if (result) invalidateUserAuthState(params.userId);
  return result;
}

export interface AdminRestoreParams {
  userId: string;
  actorId: string;
  actorUsername?: string | null;
}

/** Admin "restore" control: reverses an admin cancellation performed
 * while time remained on the period (never re-extends an already-expired
 * one - use adminGrantSubscription for that, which is explicit about
 * granting new time). */
export async function adminRestoreSubscription(params: AdminRestoreParams) {
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const subscription = await tx.subscription.findUnique({ where: { userId: params.userId } });
    if (!subscription || subscription.status !== "CANCELED") return null;
    if (!subscription.currentPeriodEnd || subscription.currentPeriodEnd.getTime() <= now.getTime()) return null;

    const claim = await tx.subscription.updateMany({
      where: { id: subscription.id, status: "CANCELED" },
      data: { status: "ACTIVE", canceledAt: null, nextBillingAt: subscription.currentPeriodEnd },
    });
    if (claim.count === 0) return null;

    await tx.user.update({ where: { id: params.userId }, data: { plan: subscription.plan } });

    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: subscription.id,
        userId: params.userId,
        action: "subscription_restored",
        actorId: params.actorId,
        actorUsername: params.actorUsername ?? null,
        prevState: { plan: "free", status: "CANCELED" },
        newState: { plan: subscription.plan, status: "ACTIVE" },
      },
    });

    return subscription.id;
  });

  if (result) invalidateUserAuthState(params.userId);
  return result;
}
