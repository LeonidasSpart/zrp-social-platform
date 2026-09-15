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
  return GET(new NextRequest("https://zrp.one/api/cron/expire-subscriptions", { headers }));
}

describe.skipIf(!hasRealDatabaseUrl)(
  "GET /api/cron/expire-subscriptions (integration, real Postgres)",
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

    it("fails closed when CRON_SECRET is unset", async () => {
      delete process.env.CRON_SECRET;
      expect((await call("test-secret")).status).toBe(401);
    });

    it("expires a due subscription and leaves a not-yet-due one untouched", async () => {
      const due = await prisma.user.create({
        data: { email: `due-${suffix}@crontest.example`, username: `due${suffix}`, password: "x", plan: "pro" },
      });
      const notDue = await prisma.user.create({
        data: { email: `notdue-${suffix}@crontest.example`, username: `nd${suffix}`, password: "x", plan: "pro" },
      });
      userIds.push(due.id, notDue.id);

      await prisma.subscription.create({
        data: {
          userId: due.id,
          plan: "pro",
          status: "ACTIVE",
          currentPeriodStart: new Date(Date.now() - 40 * 86400000),
          currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      });
      await prisma.subscription.create({
        data: {
          userId: notDue.id,
          plan: "pro",
          status: "ACTIVE",
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 20 * 86400000),
        },
      });

      const res = await call("test-secret");
      expect(res.status).toBe(200);

      const dueUser = await prisma.user.findUnique({ where: { id: due.id } });
      expect(dueUser?.plan).toBe("free");
      const notDueUser = await prisma.user.findUnique({ where: { id: notDue.id } });
      expect(notDueUser?.plan).toBe("pro");
    });
  }
);
