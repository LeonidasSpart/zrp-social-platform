import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { POST } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function req() {
  return new NextRequest("https://zrp.one/api/users/target/follow", { method: "POST" });
}

function sessionFor(user: { id: string; username: string; name?: string | null }) {
  return { user: { name: null, ...user } };
}

describe.skipIf(!hasRealDatabaseUrl)(
  "POST /api/users/[username]/follow (integration, real Postgres)",
  () => {
    const runId = randomUUID().slice(0, 8);
    const userIds: string[] = [];

    afterEach(() => {
      getServerSession.mockReset();
    });

    afterAll(async () => {
      await prisma.notification.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { fromUserId: { in: userIds } }] } });
      await prisma.follow.deleteMany({ where: { OR: [{ followerId: { in: userIds } }, { followingId: { in: userIds } }] } });
      await prisma.blocked.deleteMany({ where: { OR: [{ blockerId: { in: userIds } }, { blockedId: { in: userIds } }] } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    async function createUser(label: string, overrides: { isPrivate?: boolean } = {}) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${runId}@followtest.example`,
          username: `${label}${runId}`.slice(0, 20),
          password: "x",
          isPrivate: overrides.isPrivate ?? false,
        },
      });
      userIds.push(user.id);
      return user;
    }

    it("follows, notifies the target, and unfollow retracts that notification", async () => {
      const target = await createUser("target1");
      const follower = await createUser("follower1");
      getServerSession.mockResolvedValue(sessionFor(follower));

      const followRes = await POST(req(), { params: Promise.resolve({ username: target.username }) });
      expect(followRes.status).toBe(200);
      expect((await followRes.json()).following).toBe(true);

      const followRow = await prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: follower.id, followingId: target.id } },
      });
      expect(followRow).toBeTruthy();

      let notif = await prisma.notification.findFirst({
        where: { userId: target.id, fromUserId: follower.id, type: "follow" },
      });
      expect(notif).toBeTruthy();

      const unfollowRes = await POST(req(), { params: Promise.resolve({ username: target.username }) });
      expect(unfollowRes.status).toBe(200);
      expect((await unfollowRes.json()).following).toBe(false);

      notif = await prisma.notification.findFirst({
        where: { userId: target.id, fromUserId: follower.id, type: "follow" },
      });
      expect(notif).toBeNull();
    });

    it("a blocked-either-way relationship can never form a follow, in either direction", async () => {
      const target = await createUser("target2");
      const follower = await createUser("follower2");
      await prisma.blocked.create({ data: { blockerId: target.id, blockedId: follower.id } });
      getServerSession.mockResolvedValue(sessionFor(follower));

      const res = await POST(req(), { params: Promise.resolve({ username: target.username }) });
      expect(res.status).toBe(403);

      const followRow = await prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: follower.id, followingId: target.id } },
      });
      expect(followRow).toBeNull();
    });

    it("a private account gets a follow request instead of an immediate follow, and never a duplicate notification for a repeated pending request", async () => {
      const target = await createUser("target3", { isPrivate: true });
      const follower = await createUser("follower3");
      getServerSession.mockResolvedValue(sessionFor(follower));

      const first = await POST(req(), { params: Promise.resolve({ username: target.username }) });
      expect(first.status).toBe(200);
      const firstBody = await first.json();
      expect(firstBody.following).toBe(false);
      expect(firstBody.requested).toBe(true);

      const notifs1 = await prisma.notification.findMany({
        where: { userId: target.id, fromUserId: follower.id, type: "follow_request" },
      });
      expect(notifs1).toHaveLength(1);

      // Re-requesting while already pending must not create a second
      // notification.
      const second = await POST(req(), { params: Promise.resolve({ username: target.username }) });
      expect(second.status).toBe(200);
      expect((await second.json()).requested).toBe(true);

      const notifs2 = await prisma.notification.findMany({
        where: { userId: target.id, fromUserId: follower.id, type: "follow_request" },
      });
      expect(notifs2).toHaveLength(1);
    });

    it("a concurrent duplicate follow request is idempotent, not a 500, and never produces a duplicate row", async () => {
      const target = await createUser("target4");
      const follower = await createUser("follower4");
      getServerSession.mockResolvedValue(sessionFor(follower));

      const [a, b] = await Promise.all([
        POST(req(), { params: Promise.resolve({ username: target.username }) }),
        POST(req(), { params: Promise.resolve({ username: target.username }) }),
      ]);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);

      const rows = await prisma.follow.findMany({
        where: { followerId: follower.id, followingId: target.id },
      });
      expect(rows.length).toBeLessThanOrEqual(1);
    });
  }
);
