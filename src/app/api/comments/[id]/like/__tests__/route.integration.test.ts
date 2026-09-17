import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { POST } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function req(commentId: string, ip = "203.0.113.93") {
  return new NextRequest(`https://zrp.one/api/comments/${commentId}/like`, {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

function sessionFor(user: { id: string; username: string; name?: string | null }) {
  return { user: { name: null, ...user } };
}

/*
 * Regression coverage for a real ambiguity found by audit: post-like and
 * comment-like notifications both used to be stored as type "like" with
 * only postId (no commentId field on Notification) - liking a post and
 * liking a comment ON that same post were indistinguishable, so an
 * unlike on one could delete the wrong notification. Comment likes now
 * use a distinct "comment_like" type specifically to keep this safe.
 */
describe.skipIf(!hasRealDatabaseUrl)(
  "POST /api/comments/[id]/like (integration, real Postgres)",
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
      await prisma.commentLike.deleteMany({ where: { commentId: { in: commentIds } } });
      await prisma.blocked.deleteMany({ where: { OR: [{ blockerId: { in: userIds } }, { blockedId: { in: userIds } }] } });
      await prisma.comment.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.post.deleteMany({ where: { id: { in: postIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    async function createUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${runId}@commentliketest.example`,
          username: `${label}${runId}`.slice(0, 20),
          password: "x",
        },
      });
      userIds.push(user.id);
      return user;
    }

    it("liking a comment uses the distinct 'comment_like' type, not 'like', and un-liking retracts only that notification", async () => {
      const postAuthor = await createUser("postauthor1");
      const commentAuthor = await createUser("commentauthor1");
      const liker = await createUser("liker1");

      const post = await prisma.post.create({
        data: { content: `post ${runId}`, authorId: postAuthor.id, status: "published" },
      });
      postIds.push(post.id);
      const comment = await prisma.comment.create({
        data: { content: `comment ${runId}`, postId: post.id, authorId: commentAuthor.id },
      });
      commentIds.push(comment.id);

      getServerSession.mockResolvedValue(sessionFor(liker));

      const likeRes = await POST(req(comment.id), { params: Promise.resolve({ id: comment.id }) });
      expect((await likeRes.json()).liked).toBe(true);

      const notif = await prisma.notification.findFirst({
        where: { userId: commentAuthor.id, fromUserId: liker.id, postId: post.id },
      });
      expect(notif?.type).toBe("comment_like");
      expect(notif?.commentId).toBe(comment.id);

      const unlikeRes = await POST(req(comment.id), { params: Promise.resolve({ id: comment.id }) });
      expect((await unlikeRes.json()).liked).toBe(false);

      const notifAfterUnlike = await prisma.notification.findFirst({
        where: { userId: commentAuthor.id, fromUserId: liker.id, type: "comment_like", postId: post.id },
      });
      expect(notifAfterUnlike).toBeNull();

      // A full like -> unlike -> like cycle must leave exactly one
      // notification behind, never an orphaned first one plus a second -
      // same invariant already proven for post-likes.
      const relikeRes = await POST(req(comment.id), { params: Promise.resolve({ id: comment.id }) });
      expect((await relikeRes.json()).liked).toBe(true);

      const notifsAfterRelike = await prisma.notification.findMany({
        where: { userId: commentAuthor.id, fromUserId: liker.id, type: "comment_like", commentId: comment.id },
      });
      expect(notifsAfterRelike).toHaveLength(1);
    });

    it("unliking one comment never retracts the notification for a DIFFERENT comment on the same post liked by the same user", async () => {
      const postAuthor = await createUser("postauthor4");
      const commentAuthor = await createUser("commentauthor4");
      const liker = await createUser("liker4");

      const post = await prisma.post.create({
        data: { content: `post ${runId}`, authorId: postAuthor.id, status: "published" },
      });
      postIds.push(post.id);
      const commentA = await prisma.comment.create({
        data: { content: `comment A ${runId}`, postId: post.id, authorId: commentAuthor.id },
      });
      commentIds.push(commentA.id);
      const commentB = await prisma.comment.create({
        data: { content: `comment B ${runId}`, postId: post.id, authorId: commentAuthor.id },
      });
      commentIds.push(commentB.id);

      getServerSession.mockResolvedValue(sessionFor(liker));

      await POST(req(commentA.id), { params: Promise.resolve({ id: commentA.id }) });

      const notifForAAfterCreate = await prisma.notification.findFirst({
        where: { userId: commentAuthor.id, fromUserId: liker.id, type: "comment_like", commentId: commentA.id },
      });
      expect(notifForAAfterCreate).toBeTruthy();

      // Interacting with a DIFFERENT comment (B) must never disturb A's
      // already-existing notification, at the moment B's is created -
      // not just "eventually", checked here before anything is undone.
      await POST(req(commentB.id), { params: Promise.resolve({ id: commentB.id }) });

      const notifForAAfterB = await prisma.notification.findFirst({
        where: { userId: commentAuthor.id, fromUserId: liker.id, type: "comment_like", commentId: commentA.id },
      });
      expect(notifForAAfterB?.id).toBe(notifForAAfterCreate!.id);
      expect(notifForAAfterB?.read).toBe(false);

      // Unlike comment A only.
      await POST(req(commentA.id), { params: Promise.resolve({ id: commentA.id }) });

      const notifForA = await prisma.notification.findFirst({
        where: { userId: commentAuthor.id, fromUserId: liker.id, type: "comment_like", commentId: commentA.id },
      });
      expect(notifForA).toBeNull();

      // Comment B's notification must survive - this is the exact
      // ambiguity that used to exist before Notification.commentId:
      // both notifications shared the same type/fromUserId/postId, so
      // retracting A's could also delete B's.
      const notifForB = await prisma.notification.findFirst({
        where: { userId: commentAuthor.id, fromUserId: liker.id, type: "comment_like", commentId: commentB.id },
      });
      expect(notifForB).toBeTruthy();
      expect(notifForB?.read).toBe(false);
    });

    it("a concurrent duplicate like request is idempotent, not a 500, and never produces a duplicate notification", async () => {
      const postAuthor = await createUser("postauthor5");
      const commentAuthor = await createUser("commentauthor5");
      const liker = await createUser("liker5");

      const post = await prisma.post.create({
        data: { content: `post ${runId}`, authorId: postAuthor.id, status: "published" },
      });
      postIds.push(post.id);
      const comment = await prisma.comment.create({
        data: { content: `comment ${runId}`, postId: post.id, authorId: commentAuthor.id },
      });
      commentIds.push(comment.id);

      getServerSession.mockResolvedValue(sessionFor(liker));

      const [a, b] = await Promise.all([
        POST(req(comment.id), { params: Promise.resolve({ id: comment.id }) }),
        POST(req(comment.id), { params: Promise.resolve({ id: comment.id }) }),
      ]);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);

      const likes = await prisma.commentLike.findMany({ where: { commentId: comment.id, userId: liker.id } });
      expect(likes.length).toBeLessThanOrEqual(1);

      const notifs = await prisma.notification.findMany({
        where: { userId: commentAuthor.id, fromUserId: liker.id, type: "comment_like", commentId: comment.id },
      });
      expect(notifs.length).toBeLessThanOrEqual(1);
    });

    it("liking your own comment never creates a self-notification", async () => {
      const postAuthor = await createUser("postauthor2");
      const commentAuthor = await createUser("commentauthor2");

      const post = await prisma.post.create({
        data: { content: `post ${runId}`, authorId: postAuthor.id, status: "published" },
      });
      postIds.push(post.id);
      const comment = await prisma.comment.create({
        data: { content: `comment ${runId}`, postId: post.id, authorId: commentAuthor.id },
      });
      commentIds.push(comment.id);

      getServerSession.mockResolvedValue(sessionFor(commentAuthor));
      await POST(req(comment.id), { params: Promise.resolve({ id: comment.id }) });

      const notif = await prisma.notification.findFirst({
        where: { userId: commentAuthor.id, fromUserId: commentAuthor.id },
      });
      expect(notif).toBeNull();
    });

    it("blocks liking a comment for a blocked-either-way relationship, not just the notification", async () => {
      const postAuthor = await createUser("postauthor3");
      const commentAuthor = await createUser("commentauthor3");
      const liker = await createUser("liker3");
      await prisma.blocked.create({ data: { blockerId: commentAuthor.id, blockedId: liker.id } });

      const post = await prisma.post.create({
        data: { content: `post ${runId}`, authorId: postAuthor.id, status: "published" },
      });
      postIds.push(post.id);
      const comment = await prisma.comment.create({
        data: { content: `comment ${runId}`, postId: post.id, authorId: commentAuthor.id },
      });
      commentIds.push(comment.id);

      getServerSession.mockResolvedValue(sessionFor(liker));

      const res = await POST(req(comment.id), { params: Promise.resolve({ id: comment.id }) });
      expect(res.status).toBe(403);

      const like = await prisma.commentLike.findUnique({
        where: { commentId_userId: { commentId: comment.id, userId: liker.id } },
      });
      expect(like).toBeNull();
    });
  }
);
