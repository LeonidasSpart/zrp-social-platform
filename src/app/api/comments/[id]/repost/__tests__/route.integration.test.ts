import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { POST } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function req(commentId: string, ip = "203.0.113.94") {
  return new NextRequest(`https://zrp.one/api/comments/${commentId}/repost`, {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

function sessionFor(user: { id: string; username: string; name?: string | null; plan?: string }) {
  return { user: { name: null, plan: "free", ...user } };
}

/*
 * This route previously had none of the hardening every sibling toggle
 * route already had (confirmed missing by audit): no blocked-user check,
 * no notification to the comment's author, no race-safety on concurrent
 * create/delete, and no quota accounting at all. This coverage mirrors
 * src/app/api/posts/[id]/repost/__tests__/route.integration.test.ts,
 * including that a comment repost shares the SAME daily
 * RepostDailyUsage counter as a post repost.
 */
describe.skipIf(!hasRealDatabaseUrl)(
  "POST /api/comments/[id]/repost (integration, real Postgres)",
  () => {
    const runId = randomUUID().slice(0, 8);
    const userIds: string[] = [];
    const postIds: string[] = [];
    const commentIds: string[] = [];

    afterEach(() => {
      getServerSession.mockReset();
    });

    afterAll(async () => {
      await prisma.notification.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.commentRepost.deleteMany({ where: { commentId: { in: commentIds } } });
      await prisma.repostDailyUsage.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.blocked.deleteMany({ where: { OR: [{ blockerId: { in: userIds } }, { blockedId: { in: userIds } }] } });
      await prisma.comment.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.post.deleteMany({ where: { id: { in: postIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    async function createUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${runId}@commentreposttest.example`,
          username: `${label}${runId}`.slice(0, 20),
          password: "x",
        },
      });
      userIds.push(user.id);
      return user;
    }

    async function createCommentedPost(postAuthorId: string, commentAuthorId: string) {
      const post = await prisma.post.create({
        data: { content: `comment-repost target ${runId}`, authorId: postAuthorId, status: "published" },
      });
      postIds.push(post.id);
      const comment = await prisma.comment.create({
        data: { content: `comment ${runId}`, postId: post.id, authorId: commentAuthorId },
      });
      commentIds.push(comment.id);
      return { post, comment };
    }

    it("reposts, creates a comment_repost notification for the comment's author, and un-reposts on a second call", async () => {
      const postAuthor = await createUser("postauthor1");
      const commentAuthor = await createUser("commentauthor1");
      const reposter = await createUser("reposter1");
      const { post, comment } = await createCommentedPost(postAuthor.id, commentAuthor.id);
      getServerSession.mockResolvedValue(sessionFor(reposter));

      const first = await POST(req(comment.id), { params: Promise.resolve({ id: comment.id }) });
      expect(first.status).toBe(200);
      const firstBody = await first.json();
      expect(firstBody.reposted).toBe(true);
      expect(firstBody.limit).toBe(50);
      expect(firstBody.remaining).toBe(49);

      const row = await prisma.commentRepost.findUnique({
        where: { commentId_userId: { commentId: comment.id, userId: reposter.id } },
      });
      expect(row).toBeTruthy();

      const notif = await prisma.notification.findFirst({
        where: { userId: commentAuthor.id, fromUserId: reposter.id, type: "comment_repost", postId: post.id },
      });
      expect(notif).toBeTruthy();
      expect(notif?.read).toBe(false);
      expect(notif?.commentId).toBe(comment.id);

      const second = await POST(req(comment.id), { params: Promise.resolve({ id: comment.id }) });
      expect(second.status).toBe(200);
      expect((await second.json()).reposted).toBe(false);

      const rowAfterUndo = await prisma.commentRepost.findUnique({
        where: { commentId_userId: { commentId: comment.id, userId: reposter.id } },
      });
      expect(rowAfterUndo).toBeNull();

      const notifAfterUndo = await prisma.notification.findFirst({
        where: { userId: commentAuthor.id, fromUserId: reposter.id, type: "comment_repost", postId: post.id },
      });
      expect(notifAfterUndo).toBeNull();
    });

    it("never notifies a self-repost", async () => {
      const postAuthor = await createUser("postauthor2");
      const commentAuthor = await createUser("commentauthor2");
      const { comment } = await createCommentedPost(postAuthor.id, commentAuthor.id);
      getServerSession.mockResolvedValue(sessionFor(commentAuthor));

      const res = await POST(req(comment.id), { params: Promise.resolve({ id: comment.id }) });
      expect(res.status).toBe(200);

      const notif = await prisma.notification.findFirst({
        where: { fromUserId: commentAuthor.id, type: "comment_repost" },
      });
      expect(notif).toBeNull();
    });

    it("un-reposting one comment never retracts the notification for a DIFFERENT comment on the same post reposted by the same user", async () => {
      const postAuthor = await createUser("postauthor2b");
      const commentAuthor = await createUser("commentauthor2b");
      const reposter = await createUser("reposter2b");
      const { post } = await createCommentedPost(postAuthor.id, commentAuthor.id);
      const commentB = await prisma.comment.create({
        data: { content: `comment B ${runId}`, postId: post.id, authorId: commentAuthor.id },
      });
      commentIds.push(commentB.id);
      const commentA = (await prisma.comment.findFirst({
        where: { postId: post.id, id: { not: commentB.id } },
      }))!;

      getServerSession.mockResolvedValue(sessionFor(reposter));

      await POST(req(commentA.id), { params: Promise.resolve({ id: commentA.id }) });
      await POST(req(commentB.id), { params: Promise.resolve({ id: commentB.id }) });

      // Un-repost comment A only.
      await POST(req(commentA.id), { params: Promise.resolve({ id: commentA.id }) });

      const notifForA = await prisma.notification.findFirst({
        where: { userId: commentAuthor.id, fromUserId: reposter.id, type: "comment_repost", commentId: commentA.id },
      });
      expect(notifForA).toBeNull();

      const notifForB = await prisma.notification.findFirst({
        where: { userId: commentAuthor.id, fromUserId: reposter.id, type: "comment_repost", commentId: commentB.id },
      });
      expect(notifForB).toBeTruthy();
      expect(notifForB?.read).toBe(false);
    });

    it("blocks the repost itself (not just the notification) for a blocked-either-way relationship, and never spends a quota slot on it", async () => {
      const postAuthor = await createUser("postauthor3");
      const commentAuthor = await createUser("commentauthor3");
      const reposter = await createUser("reposter3");
      await prisma.blocked.create({ data: { blockerId: commentAuthor.id, blockedId: reposter.id } });
      const { post, comment } = await createCommentedPost(postAuthor.id, commentAuthor.id);
      getServerSession.mockResolvedValue(sessionFor(reposter));

      const res = await POST(req(comment.id), { params: Promise.resolve({ id: comment.id }) });
      expect(res.status).toBe(403);

      const row = await prisma.commentRepost.findUnique({
        where: { commentId_userId: { commentId: comment.id, userId: reposter.id } },
      });
      expect(row).toBeNull();

      const notif = await prisma.notification.findFirst({
        where: { userId: commentAuthor.id, fromUserId: reposter.id, type: "comment_repost", postId: post.id },
      });
      expect(notif).toBeNull();

      const dateKey = new Date();
      dateKey.setHours(0, 0, 0, 0);
      const usage = await prisma.repostDailyUsage.findUnique({
        where: { userId_date: { userId: reposter.id, date: dateKey } },
      });
      expect(usage).toBeNull();
    });

    it("shares the same daily quota counter as post reposts and enforces it atomically", async () => {
      const postAuthor = await createUser("postauthor4");
      const commentAuthor = await createUser("commentauthor4");
      const reposter = await createUser("reposter4");
      getServerSession.mockResolvedValue(sessionFor(reposter));

      const dateKey = new Date();
      dateKey.setHours(0, 0, 0, 0);
      await prisma.repostDailyUsage.create({
        data: { userId: reposter.id, date: dateKey, reposts: 49 },
      });

      const { comment: comment1 } = await createCommentedPost(postAuthor.id, commentAuthor.id);
      const okRes = await POST(req(comment1.id), { params: Promise.resolve({ id: comment1.id }) });
      expect(okRes.status).toBe(200);

      const usageAfterOne = await prisma.repostDailyUsage.findUnique({
        where: { userId_date: { userId: reposter.id, date: dateKey } },
      });
      expect(usageAfterOne?.reposts).toBe(50);

      const { comment: comment2 } = await createCommentedPost(postAuthor.id, commentAuthor.id);
      const blockedRes = await POST(req(comment2.id), { params: Promise.resolve({ id: comment2.id }) });
      expect(blockedRes.status).toBe(429);
      const blockedBody = await blockedRes.json();
      expect(blockedBody.limit).toBe(50);
      expect(blockedBody.remaining).toBe(0);

      const usageStillFifty = await prisma.repostDailyUsage.findUnique({
        where: { userId_date: { userId: reposter.id, date: dateKey } },
      });
      expect(usageStillFifty?.reposts).toBe(50);
    });

    it("a concurrent duplicate repost request is idempotent, not a 500, and never produces a duplicate row", async () => {
      const postAuthor = await createUser("postauthor5");
      const commentAuthor = await createUser("commentauthor5");
      const reposter = await createUser("reposter5");
      const { comment } = await createCommentedPost(postAuthor.id, commentAuthor.id);
      getServerSession.mockResolvedValue(sessionFor(reposter));

      const [a, b] = await Promise.all([
        POST(req(comment.id), { params: Promise.resolve({ id: comment.id }) }),
        POST(req(comment.id), { params: Promise.resolve({ id: comment.id }) }),
      ]);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);

      const reposts = await prisma.commentRepost.findMany({ where: { commentId: comment.id, userId: reposter.id } });
      expect(reposts.length).toBeLessThanOrEqual(1);
    });
  }
);
