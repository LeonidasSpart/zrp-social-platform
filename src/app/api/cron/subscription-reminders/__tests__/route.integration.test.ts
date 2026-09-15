import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { GET } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function call(secret?: string) {
  const headers = new Headers();
  if (secret !== undefined) headers.set("authorization", `Bearer ${secret}`);
  return GET(new NextRequest("https://zrp.one/api/cron/subscription-reminders", { headers }));
}

describe.skipIf(!hasRealDatabaseUrl)(
  "GET /api/cron/subscription-reminders (integration, real Postgres)",
  () => {
    const userIds: string[] = [];
    const suffix = randomUUID().slice(0, 8);
    let originalSecret: string | undefined;

    beforeEach(() => {
      originalSecret = process.env.CRON_SECRET;
      process.env.CRON_SECRET = "test-secret";
    });

    afterEach(() => {
      process.env.CRON_SECRET = originalSecret;
    });

    afterAll(async () => {
      await prisma.subscriptionEvent.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.subscription.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    it("rejects a request with no or an incorrect secret", async () => {
      expect((await call()).status).toBe(401);
      expect((await call("wrong")).status).toBe(401);
    });

    it("claims and marks the reminder for a subscription inside the J-7 window, and does not re-send on a second run", async () => {
      const user = await prisma.user.create({
        data: { email: `rem-${suffix}@crontest.example`, username: `rem${suffix}`, password: "x", plan: "pro" },
      });
      userIds.push(user.id);
      await prisma.subscription.create({
        data: {
          userId: user.id,
          plan: "pro",
          status: "ACTIVE",
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 2 * 86400000),
        },
      });

      const first = await call("test-secret");
      expect(first.status).toBe(200);
      const firstBody = await first.json();
      expect(firstBody.sent).toBeGreaterThanOrEqual(1);

      const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
      expect(sub?.reminderSentAt).not.toBeNull();

      const second = await call("test-secret");
      const secondBody = await second.json();
      expect(secondBody.alreadyClaimed).toBe(0); // it's no longer a NULL-reminderSentAt candidate at all
    });
  }
);
