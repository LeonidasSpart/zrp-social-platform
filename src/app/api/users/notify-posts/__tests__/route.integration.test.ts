import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { GET } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function reqWithIds(ids: string) {
  return new NextRequest(`https://zrp.one/api/users/notify-posts?ids=${encodeURIComponent(ids)}`);
}

function sessionFor(user: { id: string; username: string; name?: string | null }) {
  return { user: { name: null, ...user } };
}

describe.skipIf(!hasRealDatabaseUrl)(
  "GET /api/users/notify-posts (batch status, integration, real Postgres)",
  () => {
    const runId = randomUUID().slice(0, 8);
    const userIds: string[] = [];

    afterEach(() => {
      getServerSession.mockReset();
    });

    afterAll(async () => {
      await prisma.postSubscription.deleteMany({
        where: { OR: [{ subscriberId: { in: userIds } }, { authorId: { in: userIds } }] },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    async function createUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${runId}@batchnotifytest.example`,
          username: `${label}${runId}`.slice(0, 20),
          password: "x",
        },
      });
      userIds.push(user.id);
      return user;
    }

    it("requires auth", async () => {
      getServerSession.mockResolvedValue(null);
      const res = await GET(reqWithIds("a,b"));
      expect(res.status).toBe(401);
    });

    it("returns subscribed:true only for the authors the viewer actually subscribed to, in one batched call", async () => {
      const viewer = await createUser("batchviewer1");
      const subscribedAuthor = await createUser("batchauthorA");
      const unsubscribedAuthor = await createUser("batchauthorB");
      await prisma.postSubscription.create({
        data: { subscriberId: viewer.id, authorId: subscribedAuthor.id },
      });
      getServerSession.mockResolvedValue(sessionFor(viewer));

      const res = await GET(reqWithIds(`${subscribedAuthor.id},${unsubscribedAuthor.id}`));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body[subscribedAuthor.id]).toBe(true);
      expect(body[unsubscribedAuthor.id]).toBe(false);
    });

    it("returns 400 when ids is missing", async () => {
      const viewer = await createUser("batchviewer2");
      getServerSession.mockResolvedValue(sessionFor(viewer));

      const res = await GET(new NextRequest("https://zrp.one/api/users/notify-posts"));
      expect(res.status).toBe(400);
    });
  }
);
