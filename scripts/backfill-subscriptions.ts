/*
 * One-off historical backfill: gives every existing paid user
 * (User.plan != "free") a Subscription row, so the new authoritative
 * lifecycle (expiration engine, J-7 reminders, admin billing dashboard)
 * covers users who were upgraded before Subscription existed, without
 * anyone losing access purely because this migration ran.
 *
 * Deliberately NOT baked into the Prisma migration SQL itself - this is
 * a data backfill, not a schema change, and per CLAUDE.md's
 * expand -> backfill -> verify -> switch policy it needs to be its own
 * reviewable, dry-runnable, re-runnable step. Idempotent: skips any user
 * who already has a Subscription row, so running it twice (or after new
 * signups/payments have already created real Subscription rows) is safe.
 *
 * Policy (see docs/subscriptions.md "Historical migration policy" for
 * the full writeup):
 *   1. Free-plan users get nothing - there is no paid entitlement to
 *      reconstruct.
 *   2. If there's a real signal (a "verified" PaymentRequest or an
 *      "approved" UpgradeRequest for that user, matching their current
 *      plan) with enough information to compute a real period
 *      (plan + interval + verified/approved date), and that computed
 *      period has NOT yet lapsed as of today, the real dates are used -
 *      this is a genuinely reconstructed period, not a guess.
 *   3. Otherwise - no record found, or the reconstructed period would
 *      already be in the past (we have no way to know how many times
 *      they've silently renewed since, so we do not invent renewal
 *      history) - a conservative one-interval grant starting TODAY is
 *      created instead, so the user's access is preserved rather than
 *      immediately expired by a migration they never took any action
 *      for. The interval used is the historical record's if one exists,
 *      else monthly (the only duration ZRP has ever actually charged
 *      via the crypto route to date).
 *   Every row created by this script is flagged `isLegacyBackfill: true`
 *   and logged with a `backfilled` SubscriptionEvent recording exactly
 *   which policy branch applied and what (if any) historical record was
 *   used, so admin billing UI can label it distinctly rather than ever
 *   presenting it as an ordinary dated purchase.
 *
 * Usage (needs DATABASE_URL, same as the app):
 *   npx tsx scripts/backfill-subscriptions.ts --dry-run   # report only, zero writes
 *   npx tsx scripts/backfill-subscriptions.ts             # apply
 */

import "dotenv/config";
import { PrismaClient, type BillingInterval } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { computePeriodEnd, toBillingIntervalEnum } from "../src/lib/subscriptions";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 }),
});

const dryRun = process.argv.includes("--dry-run");

interface PlanResult {
  userId: string;
  branch: "reconstructed" | "conservative_grant";
  source: { type: "payment_request" | "upgrade_request"; id: string } | null;
  billingInterval: BillingInterval;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}

async function planForUser(userId: string, plan: string, now: Date): Promise<PlanResult> {
  const [latestPayment, latestUpgrade] = await Promise.all([
    prisma.paymentRequest.findFirst({
      where: { userId, plan, status: "verified" },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.upgradeRequest.findFirst({
      where: { userId, requestedPlan: plan, status: "approved" },
      orderBy: { approvedAt: "desc" },
    }),
  ]);

  // Prefer whichever real record is more recent, if both exist.
  const paymentDate = latestPayment?.updatedAt ?? null;
  const upgradeDate = latestUpgrade?.approvedAt ?? null;
  const useUpgrade = upgradeDate && (!paymentDate || upgradeDate > paymentDate);

  const record = useUpgrade ? latestUpgrade : latestPayment;
  const recordDate = useUpgrade ? upgradeDate : paymentDate;
  const interval: BillingInterval = useUpgrade
    ? "MONTHLY" // UpgradeRequest never captured an interval historically.
    : toBillingIntervalEnum(latestPayment?.billingInterval ?? "monthly");

  if (record && recordDate) {
    const reconstructedEnd = computePeriodEnd(recordDate, interval);
    if (reconstructedEnd.getTime() > now.getTime()) {
      return {
        userId,
        branch: "reconstructed",
        source: useUpgrade
          ? { type: "upgrade_request", id: latestUpgrade!.id }
          : { type: "payment_request", id: latestPayment!.id },
        billingInterval: interval,
        currentPeriodStart: recordDate,
        currentPeriodEnd: reconstructedEnd,
      };
    }
    // Reconstructed period already lapsed - fall through to the
    // conservative grant, but keep the interval we found for it.
    return {
      userId,
      branch: "conservative_grant",
      source: useUpgrade
        ? { type: "upgrade_request", id: latestUpgrade!.id }
        : { type: "payment_request", id: latestPayment!.id },
      billingInterval: interval,
      currentPeriodStart: now,
      currentPeriodEnd: computePeriodEnd(now, interval),
    };
  }

  return {
    userId,
    branch: "conservative_grant",
    source: null,
    billingInterval: "MONTHLY",
    currentPeriodStart: now,
    currentPeriodEnd: computePeriodEnd(now, "MONTHLY"),
  };
}

async function main() {
  const now = new Date();

  const paidUsers = await prisma.user.findMany({
    where: { plan: { not: "free" }, subscription: null },
    select: { id: true, plan: true, username: true },
  });

  console.log(`Found ${paidUsers.length} paid user(s) with no Subscription row.`);

  let reconstructed = 0;
  let conservative = 0;

  for (const user of paidUsers) {
    const plan = await planForUser(user.id, user.plan, now);

    console.log(
      `${dryRun ? "[dry-run] " : ""}user=${user.username} plan=${user.plan} branch=${plan.branch} ` +
        `interval=${plan.billingInterval} periodStart=${plan.currentPeriodStart.toISOString()} ` +
        `periodEnd=${plan.currentPeriodEnd.toISOString()} source=${plan.source ? `${plan.source.type}:${plan.source.id}` : "none"}`
    );

    if (plan.branch === "reconstructed") reconstructed++;
    else conservative++;

    if (dryRun) continue;

    await prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.create({
        data: {
          userId: user.id,
          plan: user.plan,
          status: "ACTIVE",
          billingInterval: plan.billingInterval,
          startedAt: plan.currentPeriodStart,
          currentPeriodStart: plan.currentPeriodStart,
          currentPeriodEnd: plan.currentPeriodEnd,
          nextBillingAt: plan.currentPeriodEnd,
          lastPaymentAt: plan.currentPeriodStart,
          isLegacyBackfill: true,
        },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          userId: user.id,
          action: "backfilled",
          newState: {
            plan: user.plan,
            status: "ACTIVE",
            currentPeriodStart: plan.currentPeriodStart,
            currentPeriodEnd: plan.currentPeriodEnd,
          },
          metadata: { branch: plan.branch, source: plan.source },
        },
      });
    });
  }

  console.log(
    `${dryRun ? "[dry-run] would have" : "Backfilled"} ${paidUsers.length} subscription(s): ` +
      `${reconstructed} reconstructed from real history, ${conservative} conservative grant(s).`
  );
}

main()
  .catch((err) => {
    console.error("backfill-subscriptions failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
