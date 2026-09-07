import { describe, it, expect, vi, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { GET } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function req(userId: string, query: Record<string, string> = {}) {
  const url = new URL(`https://zrp.one/api/messages/${userId}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

function sessionFor(userId: string) {
  return { user: { id: userId } };
}

function call(otherUserId: string, query: Record<string, string> = {}) {
  return GET(req(otherUserId, query), { params: Promise.resolve({ userId: otherUserId }) });
}

// Regression coverage for the audit finding that GET /api/messages/{userId}
// was completely unpaginated - it fetched and returned every message ever
// exchanged with that person on every conversation open and every 5-second
// poll (see ChatInterface.tsx). Fixing that without a request-shape change
// matters here specifically because both the live web app and the shipped
// Android app already call this route expecting a bare JSON array back -
// switching unconditionally to an {items,nextCursor} envelope would break
// message history for every already-installed client, not just add a
// feature.
describe.skipIf(!hasRealDatabaseUrl)(
  "GET /api/messages/[userId] (integration, real Postgres)",
  () => {
    const userIds: string[] = [];
    const messageIds: string[] = [];

    async function createUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${randomUUID().slice(0, 8)}@msgtest.example`,
          username: `${label}${randomUUID().slice(0, 6)}`.slice(0, 20),
          password: "x",
          role: "USER",
        },
      });
      userIds.push(user.id);
      return user;
    }

    async function seedConversation(aId: string, bId: string, count: number, startingUnread = false) {
      const base = new Date("2022-01-01T00:00:00Z").getTime();
      const ids: string[] = [];
      for (let i = 0; i < count; i++) {
        const fromA = i % 2 === 0;
        const m = await prisma.message.create({
          data: {
            id: randomUUID(),
            content: `msg ${i}`,
            senderId: fromA ? aId : bId,
            receiverId: fromA ? bId : aId,
            createdAt: new Date(base + i * 1000),
            read: startingUnread ? false : true,
          },
        });
        ids.push(m.id);
        messageIds.push(m.id);
      }
      return ids;
    }

    afterAll(async () => {
      await prisma.message.deleteMany({ where: { id: { in: messageIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    it("401s without a session", async () => {
      getServerSession.mockResolvedValueOnce(null);
      const res = await call(randomUUID());
      expect(res.status).toBe(401);
    });

    it("legacy call (no cursor/limit) returns a bare array, oldest-first, unchanged shape", async () => {
      const a = await createUser("legacya");
      const b = await createUser("legacyb");
      const ids = await seedConversation(a.id, b.id, 5);
      getServerSession.mockResolvedValueOnce(sessionFor(a.id));

      const res = await call(b.id);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.map((m: { id: string }) => m.id)).toEqual(ids);
      expect(body[0].sender).toBeDefined();
    });

    it("legacy call caps at the default page size instead of returning the entire conversation unbounded", async () => {
      const a = await createUser("capa");
      const b = await createUser("capb");
      const ids = await seedConversation(a.id, b.id, 120);
      getServerSession.mockResolvedValueOnce(sessionFor(a.id));

      const res = await call(b.id);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(100); // DEFAULT_PAGE_SIZE
      // Still the most recent 100, in ascending order - the newest
      // message (the very last one seeded) must be last in the array.
      expect(body[body.length - 1].id).toBe(ids[ids.length - 1]);
      expect(body[0].id).toBe(ids[ids.length - 100]);
    });

    it("opening a conversation still marks the other party's unread messages read, regardless of page size", async () => {
      const a = await createUser("reada");
      const b = await createUser("readb");
      await seedConversation(a.id, b.id, 3, true);
      getServerSession.mockResolvedValueOnce(sessionFor(a.id));

      await call(b.id);

      const stillUnread = await prisma.message.count({
        where: { senderId: b.id, receiverId: a.id, read: false },
      });
      expect(stillUnread).toBe(0);
    });

    it("a request with ?limit= switches to the {items,nextCursor} envelope", async () => {
      const a = await createUser("envelopea");
      const b = await createUser("envelopeb");
      const ids = await seedConversation(a.id, b.id, 5);
      getServerSession.mockResolvedValueOnce(sessionFor(a.id));

      const res = await call(b.id, { limit: "3" });
      const body = await res.json();
      expect(Array.isArray(body)).toBe(false);
      expect(body.items.map((m: { id: string }) => m.id)).toEqual(ids.slice(2)); // last 3, ascending
      expect(body.nextCursor).toBe(ids[2]);
    });

    it("paginates through an entire conversation with a small page size, visiting every message exactly once in order", async () => {
      const a = await createUser("pagea");
      const b = await createUser("pageb");
      const ids = await seedConversation(a.id, b.id, 25);
      getServerSession.mockResolvedValueOnce(sessionFor(a.id));

      // First page (no cursor yet, but explicitly paginated via limit).
      const seen: string[] = [];
      let res = await call(b.id, { limit: "7" });
      let body = await res.json();
      seen.unshift(...body.items.map((m: { id: string }) => m.id));

      let guard = 0;
      while (body.nextCursor) {
        getServerSession.mockResolvedValueOnce(sessionFor(a.id));
        res = await call(b.id, { limit: "7", cursor: body.nextCursor });
        body = await res.json();
        seen.unshift(...body.items.map((m: { id: string }) => m.id));
        guard++;
        expect(guard).toBeLessThan(20);
      }

      expect(seen).toEqual(ids);
      expect(new Set(seen).size).toBe(ids.length);
    });

    it("only returns messages between the caller and the requested user, never a third party's conversation", async () => {
      const a = await createUser("isoa");
      const b = await createUser("isob");
      const c = await createUser("isoc");
      await seedConversation(a.id, b.id, 2);
      await seedConversation(b.id, c.id, 2);
      getServerSession.mockResolvedValueOnce(sessionFor(a.id));

      const res = await call(b.id);
      const body = await res.json();
      for (const m of body) {
        expect([m.senderId, m.receiverId].sort()).toEqual([a.id, b.id].sort());
      }
    });
  }
);
