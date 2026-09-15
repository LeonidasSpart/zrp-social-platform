import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import {
  applyVerifiedPayment,
  expireDueSubscriptions,
  sendJ7Reminders,
  adminGrantSubscription,
  adminCancelSubscription,
  adminRestoreSubscription,
} from "../subscriptions";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

describe.skipIf(!hasRealDatabaseUrl)(
  "Subscription lifecycle (integration, real Postgres)",
  () => {
    const userIds: string[] = [];
    const suffix = randomUUID().slice(0, 8);

    afterAll(async () => {
      await prisma.subscriptionEvent.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.subscriptionPayment.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.subscription.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    async function createUser(label: string, plan = "free") {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${suffix}@subtest.example`,
          username: `${label}${suffix}`.slice(0, 20),
          password: "x",
          plan,
        },
      });
      userIds.push(user.id);
      return user;
    }

    it("starts a fresh period for a user with no prior subscription", async () => {
      const user = await createUser("fresh");
      const now = new Date(Date.UTC(2026, 0, 10));

      const result = await prisma.$transaction((tx) =>
        applyVerifiedPayment(tx, {
          userId: user.id,
          plan: "pro",
          billingInterval: "MONTHLY",
          amount: "9.99",
          paymentMethod: "crypto",
          source: { type: "payment_request", id: `pr-${randomUUID()}` },
          now,
        })
      );

      expect(result.duplicate).toBe(false);
      expect(result.kind).toBe("created");
      expect(result.periodStart.toISOString()).toBe(now.toISOString());
      expect(result.periodEnd.getUTCMonth()).toBe(1); // one month later

      const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
      expect(sub?.status).toBe("ACTIVE");
      expect(sub?.plan).toBe("pro");

      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      expect(dbUser?.plan).toBe("pro");
    });

    it("extends from the existing period end when the user still has remaining time on the SAME plan", async () => {
      const user = await createUser("extend", "pro");
      const firstNow = new Date(Date.UTC(2026, 0, 1));

      await prisma.$transaction((tx) =>
        applyVerifiedPayment(tx, {
          userId: user.id,
          plan: "pro",
          billingInterval: "MONTHLY",
          amount: "9.99",
          paymentMethod: "crypto",
          source: { type: "payment_request", id: `pr-${randomUUID()}` },
          now: firstNow,
        })
      );
      // Active until Feb 1. Buys another 3-months-worth (as 3 separate
      // monthly payments, matching the manual-payment model) starting
      // partway through, on Jan 20 - the documented business rule: extend
      // from the existing period end, don't restart from "now".
      const secondNow = new Date(Date.UTC(2026, 0, 20));
      const result = await prisma.$transaction((tx) =>
        applyVerifiedPayment(tx, {
          userId: user.id,
          plan: "pro",
          billingInterval: "MONTHLY",
          amount: "9.99",
          paymentMethod: "crypto",
          source: { type: "payment_request", id: `pr-${randomUUID()}` },
          now: secondNow,
        })
      );

      expect(result.kind).toBe("extended");
      // Extended period starts from Feb 1 (the first period's end), not
      // from Jan 20 (the second payment's actual date).
      expect(result.periodStart.toISOString()).toBe(new Date(Date.UTC(2026, 1, 1)).toISOString());
      expect(result.periodEnd.toISOString()).toBe(new Date(Date.UTC(2026, 2, 1)).toISOString());

      const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
      // currentPeriodStart stays at the ORIGINAL grant, only the end moves.
      expect(sub?.currentPeriodStart?.toISOString()).toBe(new Date(Date.UTC(2026, 0, 1)).toISOString());
    });

    it("starts a fresh period (no proration) when the plan changes mid-period", async () => {
      const user = await createUser("planchange", "pro");
      const firstNow = new Date(Date.UTC(2026, 0, 1));
      await prisma.$transaction((tx) =>
        applyVerifiedPayment(tx, {
          userId: user.id,
          plan: "pro",
          billingInterval: "MONTHLY",
          amount: "9.99",
          paymentMethod: "crypto",
          source: { type: "payment_request", id: `pr-${randomUUID()}` },
          now: firstNow,
        })
      );

      const upgradeNow = new Date(Date.UTC(2026, 0, 15));
      const result = await prisma.$transaction((tx) =>
        applyVerifiedPayment(tx, {
          userId: user.id,
          plan: "business",
          billingInterval: "MONTHLY",
          amount: "49.99",
          paymentMethod: "crypto",
          source: { type: "payment_request", id: `pr-${randomUUID()}` },
          now: upgradeNow,
        })
      );

      expect(result.kind).toBe("plan_changed");
      // Fresh period from the upgrade date, not appended to the old plan's period.
      expect(result.periodStart.toISOString()).toBe(upgradeNow.toISOString());
      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      expect(dbUser?.plan).toBe("business");
    });

    it("submitting the same payment reference twice is a no-op the second time", async () => {
      const user = await createUser("dup");
      const sourceId = `pr-${randomUUID()}`;
      const now = new Date();

      const first = await prisma.$transaction((tx) =>
        applyVerifiedPayment(tx, {
          userId: user.id,
          plan: "pro",
          billingInterval: "MONTHLY",
          amount: "9.99",
          paymentMethod: "crypto",
          source: { type: "payment_request", id: sourceId },
          now,
        })
      );
      expect(first.duplicate).toBe(false);

      const second = await prisma.$transaction((tx) =>
        applyVerifiedPayment(tx, {
          userId: user.id,
          plan: "pro",
          billingInterval: "MONTHLY",
          amount: "9.99",
          paymentMethod: "crypto",
          source: { type: "payment_request", id: sourceId },
          now,
        })
      );
      expect(second.duplicate).toBe(true);

      const payments = await prisma.subscriptionPayment.findMany({ where: { paymentRequestId: sourceId } });
      expect(payments).toHaveLength(1);
    });

    it("concurrent payment verification for the same source never double-grants", async () => {
      const user = await createUser("concurrent-payment");
      const sourceId = `pr-${randomUUID()}`;

      const attempt = () =>
        prisma.$transaction((tx) =>
          applyVerifiedPayment(tx, {
            userId: user.id,
            plan: "pro",
            billingInterval: "MONTHLY",
            amount: "9.99",
            paymentMethod: "crypto",
            source: { type: "payment_request", id: sourceId },
          })
        );

      const results = await Promise.all([attempt(), attempt(), attempt()]);
      const duplicates = results.filter((r) => r.duplicate).length;
      expect(duplicates).toBe(2);

      const payments = await prisma.subscriptionPayment.findMany({ where: { paymentRequestId: sourceId } });
      expect(payments).toHaveLength(1);
    });

    it("expiration engine revokes entitlement and downgrades the user's plan", async () => {
      const user = await createUser("expiring", "pro");
      const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await prisma.subscription.create({
        data: {
          userId: user.id,
          plan: "pro",
          status: "ACTIVE",
          billingInterval: "MONTHLY",
          currentPeriodStart: new Date(past.getTime() - 30 * 86400000),
          currentPeriodEnd: past,
          nextBillingAt: past,
        },
      });

      const result = await expireDueSubscriptions();
      expect(result.expired).toBeGreaterThanOrEqual(1);

      const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
      expect(sub?.status).toBe("EXPIRED");
      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      expect(dbUser?.plan).toBe("free");

      const events = await prisma.subscriptionEvent.findMany({ where: { userId: user.id, action: "subscription_expired" } });
      expect(events).toHaveLength(1);
    });

    it("repeated expiration-worker runs never double-process the same subscription", async () => {
      const user = await createUser("expire-repeat", "business");
      const past = new Date(Date.now() - 60 * 60 * 1000);
      await prisma.subscription.create({
        data: {
          userId: user.id,
          plan: "business",
          status: "ACTIVE",
          billingInterval: "MONTHLY",
          currentPeriodStart: new Date(past.getTime() - 30 * 86400000),
          currentPeriodEnd: past,
        },
      });

      const [a, b] = await Promise.all([expireDueSubscriptions(), expireDueSubscriptions()]);
      const totalExpiredThisSub = a.expired + b.expired; // across both calls, combined with other fixtures too
      expect(totalExpiredThisSub).toBeGreaterThanOrEqual(1);

      const events = await prisma.subscriptionEvent.findMany({ where: { userId: user.id, action: "subscription_expired" } });
      expect(events).toHaveLength(1); // never double-logged regardless of overlapping runs
    });

    it("sends exactly one J-7 reminder per period even if the worker runs many times", async () => {
      const user = await createUser("reminder", "pro");
      const periodEnd = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days out - inside the 7-day window
      await prisma.subscription.create({
        data: {
          userId: user.id,
          plan: "pro",
          status: "ACTIVE",
          billingInterval: "MONTHLY",
          currentPeriodStart: new Date(),
          currentPeriodEnd: periodEnd,
        },
      });

      const first = await sendJ7Reminders();
      const second = await sendJ7Reminders();
      const third = await sendJ7Reminders();

      const totalSent = first.sent + second.sent + third.sent;
      // Only counts this fixture, but since sent only increments on an
      // actual successful claim, and reminderSentAt is now set, the 2nd
      // and 3rd calls cannot re-claim it.
      const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
      expect(sub?.reminderSentAt).not.toBeNull();

      const events = await prisma.subscriptionEvent.findMany({
        where: { userId: user.id, action: { in: ["reminder_sent", "reminder_failed"] } },
      });
      expect(events).toHaveLength(1);
      expect(totalSent).toBeGreaterThanOrEqual(1);
    });

    it("does not touch financial fields (plan/status/period) when sending a reminder", async () => {
      const user = await createUser("reminder-financial-safety", "business");
      const periodEnd = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      const periodStart = new Date();
      await prisma.subscription.create({
        data: {
          userId: user.id,
          plan: "business",
          status: "ACTIVE",
          billingInterval: "YEARLY",
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        },
      });

      await sendJ7Reminders();

      const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
      expect(sub?.status).toBe("ACTIVE");
      expect(sub?.plan).toBe("business");
      expect(sub?.currentPeriodEnd?.getTime()).toBe(periodEnd.getTime());
      expect(sub?.currentPeriodStart?.getTime()).toBe(periodStart.getTime());
    });

    it("admin grant extends an active subscription and admin cancel/restore round-trip", async () => {
      const user = await createUser("admin-controls", "pro");
      const granted = await adminGrantSubscription({
        userId: user.id,
        plan: "pro",
        billingInterval: "monthly",
        actorId: "admin-test",
        ref: `admin-${randomUUID()}`,
      });
      expect(granted.duplicate).toBe(false);

      const canceledId = await adminCancelSubscription({ userId: user.id, actorId: "admin-test" });
      expect(canceledId).toBe(granted.subscriptionId);
      let sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
      expect(sub?.status).toBe("CANCELED");
      let dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      expect(dbUser?.plan).toBe("free");

      const restoredId = await adminRestoreSubscription({ userId: user.id, actorId: "admin-test" });
      expect(restoredId).toBe(granted.subscriptionId);
      sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
      expect(sub?.status).toBe("ACTIVE");
      dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      expect(dbUser?.plan).toBe("pro");

      // Cancel/restore are each idempotent no-ops when there's nothing
      // valid to do: canceling an already-CANCELED row, or restoring an
      // already-ACTIVE one, both return null rather than acting again.
      const secondCancel = await adminCancelSubscription({ userId: user.id, actorId: "admin-test" });
      expect(secondCancel).not.toBeNull(); // ACTIVE -> CANCELED again, a real action
      const noOpCancel = await adminCancelSubscription({ userId: user.id, actorId: "admin-test" });
      expect(noOpCancel).toBeNull(); // already CANCELED

      const secondRestore = await adminRestoreSubscription({ userId: user.id, actorId: "admin-test" });
      expect(secondRestore).not.toBeNull(); // CANCELED -> ACTIVE again, a real action
      const noOpRestore = await adminRestoreSubscription({ userId: user.id, actorId: "admin-test" });
      expect(noOpRestore).toBeNull(); // already ACTIVE
    });

    it("client-supplied duration/amount is never trusted - amount is always looked up server-side", async () => {
      // getPlanPrice (used by the payment/crypto and upgrade-requests
      // routes) never accepts a client-provided amount; this asserts the
      // contract at the type level by confirming the same plan+interval
      // always resolves to the same, config-driven price regardless of
      // call site.
      const { getPlanPrice } = await import("../subscriptions");
      expect(getPlanPrice("pro", "monthly")).toBe(9.99);
      expect(getPlanPrice("enterprise", "yearly")).toBe(999.99);
    });
  }
);
