import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { PUT } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function req(id: string, ip = "203.0.113.94") {
  return new NextRequest(`https://zrp.one/api/notifications/${id}`, {
    method: "PUT",
    headers: { "x-forwarded-for": ip },
  });
}

function sessionFor(userId: string) {
  return { user: { id: userId } };
}

/*
 * Confirmed missing entirely by audit - only a bulk mark-all-read
 * endpoint existed. Individual-notification read must: authenticate,
 * verify ownership (never trust a client-supplied id to belong to the
 * caller), be idempotent, and touch only the requested notification.
 */
describe.skipIf(!hasRealDatabaseUrl)(
  "PUT /api/notifications/[id] (integration, real Postgres)",
  () => {
    const runId = randomUUID().slice(0, 8);
    const userIds: string[] = [];
    const notificationIds: string[] = [];

    afterEach(() => {
      getServerSession.mockReset();
    });

    afterAll(async () => {
      await prisma.notification.deleteMany({ where: { id: { in: notificationIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    async function createUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${runId}@notifreadtest.example`,
          username: `${label}${runId}`.slice(0, 20),
          password: "x",
        },
      });
      userIds.push(user.id);
      return user;
    }

    async function createNotif(userId: string, fromUserId: string) {
      const n = await prisma.notification.create({
        data: { userId, fromUserId, type: "follow" },
      });
      notificationIds.push(n.id);
      return n;
    }

    it("marks exactly the requested notification read, leaving an unrelated one alone", async () => {
      const owner = await createUser("owner1");
      const actor = await createUser("actor1");
      const n1 = await createNotif(owner.id, actor.id);
      const n2 = await createNotif(owner.id, actor.id);
      getServerSession.mockResolvedValue(sessionFor(owner.id));

      const res = await PUT(req(n1.id), { params: Promise.resolve({ id: n1.id }) });
      expect(res.status).toBe(200);

      const updated1 = await prisma.notification.findUnique({ where: { id: n1.id } });
      const updated2 = await prisma.notification.findUnique({ where: { id: n2.id } });
      expect(updated1?.read).toBe(true);
      expect(updated2?.read).toBe(false);
    });

    it("404s for a notification belonging to someone else - never reveals it exists, never mutates it", async () => {
      const owner = await createUser("owner2");
      const actor = await createUser("actor2");
      const attacker = await createUser("attacker2");
      const n = await createNotif(owner.id, actor.id);
      getServerSession.mockResolvedValue(sessionFor(attacker.id));

      const res = await PUT(req(n.id), { params: Promise.resolve({ id: n.id }) });
      expect(res.status).toBe(404);

      const stillUnread = await prisma.notification.findUnique({ where: { id: n.id } });
      expect(stillUnread?.read).toBe(false);
    });

    it("401s an unauthenticated caller", async () => {
      const owner = await createUser("owner3");
      const actor = await createUser("actor3");
      const n = await createNotif(owner.id, actor.id);
      getServerSession.mockResolvedValue(null);

      const res = await PUT(req(n.id), { params: Promise.resolve({ id: n.id }) });
      expect(res.status).toBe(401);
    });

    it("is idempotent - marking an already-read notification read again is a harmless 200", async () => {
      const owner = await createUser("owner4");
      const actor = await createUser("actor4");
      const n = await createNotif(owner.id, actor.id);
      getServerSession.mockResolvedValue(sessionFor(owner.id));

      const first = await PUT(req(n.id), { params: Promise.resolve({ id: n.id }) });
      expect(first.status).toBe(200);
      const second = await PUT(req(n.id), { params: Promise.resolve({ id: n.id }) });
      expect(second.status).toBe(200);

      const final = await prisma.notification.findUnique({ where: { id: n.id } });
      expect(final?.read).toBe(true);
    });

    it("404s for a nonexistent notification id", async () => {
      const owner = await createUser("owner5");
      getServerSession.mockResolvedValue(sessionFor(owner.id));

      const res = await PUT(req("does-not-exist-anywhere"), { params: Promise.resolve({ id: "does-not-exist-anywhere" }) });
      expect(res.status).toBe(404);
    });
  }
);
