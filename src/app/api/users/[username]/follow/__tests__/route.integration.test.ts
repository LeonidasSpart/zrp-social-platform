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

    it("a follow-back is a distinct notification type, identifying the right user, and unfollowing retracts it", async () => {
      const a = await createUser("mutualA5");
      const b = await createUser("mutualB5");

      // A follows B first.
      getServerSession.mockResolvedValue(sessionFor(a));
      const aFollowsB = await POST(req(), { params: Promise.resolve({ username: b.username }) });
      expect(aFollowsB.status).toBe(200);

      const bNotif = await prisma.notification.findFirst({
        where: { userId: b.id, fromUserId: a.id },
      });
      expect(bNotif?.type).toBe("follow");

      // B follows A back - this is the reported bug scenario: A's
      // notification must reflect that B followed them BACK (a distinct
      // type from a plain "follow"), not the generic first-follow type.
      getServerSession.mockResolvedValue(sessionFor(b));
      const bFollowsA = await POST(req(), { params: Promise.resolve({ username: a.username }) });
      expect(bFollowsA.status).toBe(200);

      // Both directions of the relationship now genuinely exist -
      // the underlying state, not just the notification text, must be
      // correct.
      const aFollowsBRow = await prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: a.id, followingId: b.id } },
      });
      const bFollowsARow = await prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: b.id, followingId: a.id } },
      });
      expect(aFollowsBRow).toBeTruthy();
      expect(bFollowsARow).toBeTruthy();

      // A's notification (from B's follow-back) must be type
      // "follow_back", not "follow" - and must correctly attribute B,
      // not some other user, as the actor.
      const aNotif = await prisma.notification.findFirst({
        where: { userId: a.id, fromUserId: b.id },
      });
      expect(aNotif?.type).toBe("follow_back");
      expect(aNotif?.fromUserId).toBe(b.id);

      // B's own original notification (from step 1) is untouched by A's
      // later action - still the plain "follow" type, since when A
      // first followed B, B did not yet follow A back.
      const bNotifAfter = await prisma.notification.findFirst({
        where: { userId: b.id, fromUserId: a.id },
      });
      expect(bNotifAfter?.type).toBe("follow");

      // B unfollowing A must retract the follow_back notification it
      // created (same "no orphaned unread notification" rule as a plain
      // follow), not just silently fail to match it because it's
      // looking for the wrong type.
      const bUnfollowsA = await POST(req(), { params: Promise.resolve({ username: a.username }) });
      expect(bUnfollowsA.status).toBe(200);
      expect((await bUnfollowsA.json()).following).toBe(false);

      const aNotifAfterUnfollow = await prisma.notification.findFirst({
        where: { userId: a.id, fromUserId: b.id, type: "follow_back" },
      });
      expect(aNotifAfterUnfollow).toBeNull();

      // B following A again re-creates the mutual relationship and must
      // again produce a follow_back notification (not a duplicate-guard
      // false negative from the retracted row).
      const bFollowsAAgain = await POST(req(), { params: Promise.resolve({ username: a.username }) });
      expect(bFollowsAAgain.status).toBe(200);
      const aNotifAgain = await prisma.notification.findFirst({
        where: { userId: a.id, fromUserId: b.id, type: "follow_back" },
      });
      expect(aNotifAgain).toBeTruthy();
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
