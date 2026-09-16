import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { POST } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function req(postId: string, ip = "203.0.113.90") {
  return new NextRequest(`https://zrp.one/api/posts/${postId}/repost`, {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

function sessionFor(user: { id: string; username: string; name?: string | null; plan?: string }) {
  return { user: { name: null, plan: "free", ...user } };
}

/*
 * Repost route regression coverage - see the master directive this was
 * built under. Before this pass: no repost quota existed anywhere
 * (confirmed by audit), repost created no notification at all, and the
 * check-then-act toggle raced under concurrency.
 */
describe.skipIf(!hasRealDatabaseUrl)(
  "POST /api/posts/[id]/repost (integration, real Postgres)",
  () => {
    const runId = randomUUID().slice(0, 8);
    const userIds: string[] = [];
    const postIds: string[] = [];

    afterEach(() => {
      getServerSession.mockReset();
    });

    afterAll(async () => {
      await prisma.notification.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.repost.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.repostDailyUsage.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.blocked.deleteMany({ where: { OR: [{ blockerId: { in: userIds } }, { blockedId: { in: userIds } }] } });
      await prisma.post.deleteMany({ where: { id: { in: postIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    async function createUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${runId}@reposttest.example`,
          username: `${label}${runId}`.slice(0, 20),
          password: "x",
        },
      });
      userIds.push(user.id);
      return user;
    }

    async function createPost(authorId: string) {
      const post = await prisma.post.create({
        data: { content: `repost target ${runId}`, authorId, status: "published" },
      });
      postIds.push(post.id);
      return post;
    }

    it("reposts, creates a notification for the author, and un-reposts on a second call", async () => {
      const author = await createUser("author1");
      const reposter = await createUser("reposter1");
      const post = await createPost(author.id);
      getServerSession.mockResolvedValue(sessionFor(reposter));

      const first = await POST(req(post.id), { params: Promise.resolve({ id: post.id }) });
      expect(first.status).toBe(200);
      const firstBody = await first.json();
      expect(firstBody.reposted).toBe(true);
      // The client needs to know how much quota is left after a
      // successful repost so it can warn before the daily limit is
      // actually hit, not just after (confirmed missing before this).
      expect(firstBody.limit).toBe(50);
      expect(firstBody.remaining).toBe(49);

      const row = await prisma.repost.findUnique({ where: { postId_userId: { postId: post.id, userId: reposter.id } } });
      expect(row).toBeTruthy();

      const notif = await prisma.notification.findFirst({
        where: { userId: author.id, fromUserId: reposter.id, type: "repost", postId: post.id },
      });
      expect(notif).toBeTruthy();
      expect(notif?.read).toBe(false);

      const second = await POST(req(post.id), { params: Promise.resolve({ id: post.id }) });
      expect(second.status).toBe(200);
      expect((await second.json()).reposted).toBe(false);

      const rowAfterUndo = await prisma.repost.findUnique({ where: { postId_userId: { postId: post.id, userId: reposter.id } } });
      expect(rowAfterUndo).toBeNull();

      // Retracted, so re-reposting later doesn't stack a second row on
      // top of an orphaned unread one.
      const notifAfterUndo = await prisma.notification.findFirst({
        where: { userId: author.id, fromUserId: reposter.id, type: "repost", postId: post.id },
      });
      expect(notifAfterUndo).toBeNull();
    });

    it("never notifies a self-repost", async () => {
      const author = await createUser("author2");
      const post = await createPost(author.id);
      getServerSession.mockResolvedValue(sessionFor(author));

      const res = await POST(req(post.id), { params: Promise.resolve({ id: post.id }) });
      expect(res.status).toBe(200);

      const notif = await prisma.notification.findFirst({
        where: { fromUserId: author.id, type: "repost", postId: post.id },
      });
      expect(notif).toBeNull();
    });

    it("blocks the repost itself (not just the notification) for a blocked-either-way relationship, and never spends a quota slot on it", async () => {
      const author = await createUser("author3");
      const reposter = await createUser("reposter3");
      await prisma.blocked.create({ data: { blockerId: author.id, blockedId: reposter.id } });
      const post = await createPost(author.id);
      getServerSession.mockResolvedValue(sessionFor(reposter));

      const res = await POST(req(post.id), { params: Promise.resolve({ id: post.id }) });
      expect(res.status).toBe(403);

      const row = await prisma.repost.findUnique({ where: { postId_userId: { postId: post.id, userId: reposter.id } } });
      expect(row).toBeNull();

      const notif = await prisma.notification.findFirst({
        where: { userId: author.id, fromUserId: reposter.id, type: "repost", postId: post.id },
      });
      expect(notif).toBeNull();

      const dateKey = new Date();
      dateKey.setHours(0, 0, 0, 0);
      const usage = await prisma.repostDailyUsage.findUnique({
        where: { userId_date: { userId: reposter.id, date: dateKey } },
      });
      expect(usage).toBeNull();
    });

    it("enforces the daily repost quota atomically and does not consume it on a duplicate/racing request", async () => {
      const author = await createUser("author4");
      const reposter = await createUser("reposter4");
      getServerSession.mockResolvedValue(sessionFor(reposter));

      // free plan limit is 50/day - manually pin today's usage to one
      // below the limit so the boundary is reachable without creating
      // 50 real posts.
      const dateKey = new Date();
      dateKey.setHours(0, 0, 0, 0);
      await prisma.repostDailyUsage.create({
        data: { userId: reposter.id, date: dateKey, reposts: 49 },
      });

      const post1 = await createPost(author.id);
      const okRes = await POST(req(post1.id), { params: Promise.resolve({ id: post1.id }) });
      expect(okRes.status).toBe(200);

      const usageAfterOne = await prisma.repostDailyUsage.findUnique({
        where: { userId_date: { userId: reposter.id, date: dateKey } },
      });
      expect(usageAfterOne?.reposts).toBe(50);

      // Now at the limit - the next repost (on a different post, so it's
      // not just a duplicate-toggle) must be rejected, not silently allowed.
      const post2 = await createPost(author.id);
      const blockedRes = await POST(req(post2.id), { params: Promise.resolve({ id: post2.id }) });
      expect(blockedRes.status).toBe(429);
      const blockedBody = await blockedRes.json();
      expect(blockedBody.limit).toBe(50);
      expect(blockedBody.remaining).toBe(0);

      const usageStillFifty = await prisma.repostDailyUsage.findUnique({
        where: { userId_date: { userId: reposter.id, date: dateKey } },
      });
      expect(usageStillFifty?.reposts).toBe(50);

      // A repost that was already reposted (duplicate/idempotent call)
      // must not consume a second slot.
      const duplicateRes = await POST(req(post1.id), { params: Promise.resolve({ id: post1.id }) });
      expect(duplicateRes.status).toBe(200);
      expect((await duplicateRes.json()).reposted).toBe(false); // toggles to un-repost

      const usageAfterUndo = await prisma.repostDailyUsage.findUnique({
        where: { userId_date: { userId: reposter.id, date: dateKey } },
      });
      expect(usageAfterUndo?.reposts).toBe(50); // undo never restores quota, by design
    });
  }
);
