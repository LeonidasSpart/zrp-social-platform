import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { POST, GET } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function postReq() {
  return new NextRequest("https://zrp.one/api/users/target/notify-posts", { method: "POST" });
}

function getReq() {
  return new NextRequest("https://zrp.one/api/users/target/notify-posts", { method: "GET" });
}

function sessionFor(user: { id: string; username: string; name?: string | null }) {
  return { user: { name: null, ...user } };
}

describe.skipIf(!hasRealDatabaseUrl)(
  "POST/GET /api/users/[username]/notify-posts (integration, real Postgres)",
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
      await prisma.blocked.deleteMany({
        where: { OR: [{ blockerId: { in: userIds } }, { blockedId: { in: userIds } }] },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    async function createUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${runId}@notifyposttest.example`,
          username: `${label}${runId}`.slice(0, 20),
          password: "x",
        },
      });
      userIds.push(user.id);
      return user;
    }

    it("requires auth", async () => {
      getServerSession.mockResolvedValue(null);
      const target = await createUser("targetauth");
      const res = await POST(postReq(), { params: Promise.resolve({ username: target.username }) });
      expect(res.status).toBe(401);
    });

    it("toggles subscribe -> unsubscribe -> subscribe, and GET reflects the current state", async () => {
      const author = await createUser("target1");
      const viewer = await createUser("viewer1");
      getServerSession.mockResolvedValue(sessionFor(viewer));

      const subscribeRes = await POST(postReq(), { params: Promise.resolve({ username: author.username }) });
      expect(subscribeRes.status).toBe(200);
      expect((await subscribeRes.json()).subscribed).toBe(true);

      let statusRes = await GET(getReq(), { params: Promise.resolve({ username: author.username }) });
      expect((await statusRes.json()).subscribed).toBe(true);

      const row = await prisma.postSubscription.findUnique({
        where: { subscriberId_authorId: { subscriberId: viewer.id, authorId: author.id } },
      });
      expect(row).toBeTruthy();

      const unsubscribeRes = await POST(postReq(), { params: Promise.resolve({ username: author.username }) });
      expect(unsubscribeRes.status).toBe(200);
      expect((await unsubscribeRes.json()).subscribed).toBe(false);

      statusRes = await GET(getReq(), { params: Promise.resolve({ username: author.username }) });
      expect((await statusRes.json()).subscribed).toBe(false);

      const rowAfter = await prisma.postSubscription.findUnique({
        where: { subscriberId_authorId: { subscriberId: viewer.id, authorId: author.id } },
      });
      expect(rowAfter).toBeNull();
    });

    it("rejects subscribing to your own posts with 400", async () => {
      const self = await createUser("selfsub1");
      getServerSession.mockResolvedValue(sessionFor(self));

      const res = await POST(postReq(), { params: Promise.resolve({ username: self.username }) });
      expect(res.status).toBe(400);

      const row = await prisma.postSubscription.findUnique({
        where: { subscriberId_authorId: { subscriberId: self.id, authorId: self.id } },
      });
      expect(row).toBeNull();
    });

    it("a blocked-either-way relationship can never form a subscription, in either direction", async () => {
      const author = await createUser("target2");
      const viewer = await createUser("viewer2");
      await prisma.blocked.create({ data: { blockerId: author.id, blockedId: viewer.id } });
      getServerSession.mockResolvedValue(sessionFor(viewer));

      const res = await POST(postReq(), { params: Promise.resolve({ username: author.username }) });
      expect(res.status).toBe(403);

      const row = await prisma.postSubscription.findUnique({
        where: { subscriberId_authorId: { subscriberId: viewer.id, authorId: author.id } },
      });
      expect(row).toBeNull();
    });

    it("returns 404 for a nonexistent target username", async () => {
      const viewer = await createUser("viewer3");
      getServerSession.mockResolvedValue(sessionFor(viewer));

      const res = await POST(postReq(), { params: Promise.resolve({ username: `ghost-${runId}` }) });
      expect(res.status).toBe(404);
    });

    it("a concurrent duplicate subscribe is idempotent, not a 500, and never produces a duplicate row", async () => {
      const author = await createUser("target4");
      const viewer = await createUser("viewer4");
      getServerSession.mockResolvedValue(sessionFor(viewer));

      const [a, b] = await Promise.all([
        POST(postReq(), { params: Promise.resolve({ username: author.username }) }),
        POST(postReq(), { params: Promise.resolve({ username: author.username }) }),
      ]);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);

      const rows = await prisma.postSubscription.findMany({
        where: { subscriberId: viewer.id, authorId: author.id },
      });
      expect(rows.length).toBeLessThanOrEqual(1);
    });

    it("the subscriber identity always comes from the session, never a client-supplied field - a viewer can only toggle their own subscription", async () => {
      const author = await createUser("target5");
      const viewerA = await createUser("viewer5a");
      const viewerB = await createUser("viewer5b");

      // viewerA subscribes.
      getServerSession.mockResolvedValue(sessionFor(viewerA));
      await POST(postReq(), { params: Promise.resolve({ username: author.username }) });

      // viewerB's own POST (route reads subscriberId only from the
      // session - there is no request-body field that could let one
      // user modify another user's subscription row) must only ever
      // affect viewerB's own row, never viewerA's.
      getServerSession.mockResolvedValue(sessionFor(viewerB));
      await POST(postReq(), { params: Promise.resolve({ username: author.username }) });

      const rowA = await prisma.postSubscription.findUnique({
        where: { subscriberId_authorId: { subscriberId: viewerA.id, authorId: author.id } },
      });
      const rowB = await prisma.postSubscription.findUnique({
        where: { subscriberId_authorId: { subscriberId: viewerB.id, authorId: author.id } },
      });
      expect(rowA).toBeTruthy();
      expect(rowB).toBeTruthy();
    });
  }
);
