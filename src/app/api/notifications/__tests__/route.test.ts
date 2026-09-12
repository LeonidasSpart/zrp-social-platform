import { describe, it, expect, vi, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { GET } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function req(query: Record<string, string> = {}) {
  const url = new URL("https://zrp.one/api/notifications");
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

function sessionFor(userId: string) {
  return { user: { id: userId } };
}

/*
 * Regression coverage for the closure-pass fix: GET /api/notifications
 * gained optional cursor pagination via ?cursor=/?limit= and an
 * X-Next-Cursor response header - WITHOUT changing the response body's
 * shape at all. Both the web client (`Array.isArray(data)`) and the iOS
 * app (JSONDecoder decoding `[AppNotification]` directly - see
 * ios-native/ZRPSocial/Models/AppNotification.swift) depend on that
 * body staying a bare array; these tests exist specifically to catch a
 * future change that wraps it in `{items, nextCursor}` or similar.
 */
describe.skipIf(!hasRealDatabaseUrl)(
  "GET /api/notifications pagination (integration, real Postgres)",
  () => {
    const userIds: string[] = [];
    const notificationIds: string[] = [];

    afterAll(async () => {
      await prisma.notification.deleteMany({ where: { id: { in: notificationIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    async function createUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${randomUUID().slice(0, 8)}@notiftest.example`,
          username: `${label}${randomUUID().slice(0, 8)}`.slice(0, 20),
          password: "x",
        },
      });
      userIds.push(user.id);
      return user;
    }

    async function createNotification(userId: string, createdAt: Date) {
      const n = await prisma.notification.create({
        data: {
          userId,
          fromUserId: userId,
          type: "like",
          createdAt,
        },
      });
      notificationIds.push(n.id);
      return n;
    }

    it("returns a bare array (not an object) with no query params, exactly as before", async () => {
      const user = await createUser("bare");
      getServerSession.mockResolvedValue(sessionFor(user.id));

      const base = new Date("2024-01-01T00:00:00Z").getTime();
      for (let i = 0; i < 5; i++) {
        await createNotification(user.id, new Date(base + i * 1000));
      }

      const res = await GET(req());
      const body = await res.json();

      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(5);
      // No pagination header when everything fits on one page.
      expect(res.headers.get("X-Next-Cursor")).toBeNull();
    });

    it("still defaults to at most 50 notifications when no ?limit= is given (unchanged from before pagination)", async () => {
      const user = await createUser("default50");
      getServerSession.mockResolvedValue(sessionFor(user.id));

      const base = new Date("2024-01-01T00:00:00Z").getTime();
      for (let i = 0; i < 55; i++) {
        await createNotification(user.id, new Date(base + i * 1000));
      }

      const res = await GET(req());
      const body = await res.json();

      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(50);
      // More exist beyond this page - a client that knows to look can
      // now page further without a body-shape change.
      expect(res.headers.get("X-Next-Cursor")).not.toBeNull();
    });

    it("?cursor= from X-Next-Cursor fetches the next older page, still as a bare array, until exhausted", async () => {
      const user = await createUser("cursor");
      getServerSession.mockResolvedValue(sessionFor(user.id));

      const base = new Date("2024-01-01T00:00:00Z").getTime();
      for (let i = 0; i < 12; i++) {
        await createNotification(user.id, new Date(base + i * 1000));
      }

      const firstRes = await GET(req({ limit: "5" }));
      const firstBody = await firstRes.json();
      expect(firstBody.length).toBe(5);
      const cursor1 = firstRes.headers.get("X-Next-Cursor");
      expect(cursor1).not.toBeNull();

      const secondRes = await GET(req({ limit: "5", cursor: cursor1! }));
      const secondBody = await secondRes.json();
      expect(secondBody.length).toBe(5);
      const cursor2 = secondRes.headers.get("X-Next-Cursor");
      expect(cursor2).not.toBeNull();

      // No overlap between pages.
      const firstIds = new Set(firstBody.map((n: { id: string }) => n.id));
      for (const n of secondBody) expect(firstIds.has(n.id)).toBe(false);

      const thirdRes = await GET(req({ limit: "5", cursor: cursor2! }));
      const thirdBody = await thirdRes.json();
      expect(thirdBody.length).toBe(2); // 12 total - 5 - 5
      // Exhausted - no further page.
      expect(thirdRes.headers.get("X-Next-Cursor")).toBeNull();
    });

    it("still requires auth", async () => {
      getServerSession.mockResolvedValue(null);
      const res = await GET(req());
      expect(res.status).toBe(401);
    });
  }
);
