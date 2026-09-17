import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { POST as likeToggle } from "../route";
import { GET as getComments } from "../../../../posts/[id]/comments/route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function likeReq(commentId: string, ip = "203.0.113.96") {
  return new NextRequest(`https://zrp.one/api/comments/${commentId}/like`, {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

function commentsReq(postId: string) {
  return new NextRequest(`https://zrp.one/api/posts/${postId}/comments`);
}

function sessionFor(user: { id: string; username: string; name?: string | null }) {
  return { user: { name: null, ...user } };
}

/*
 * Comment-like half of the "a like appears to disappear hours later"
 * investigation - see the sibling posts/[id]/like persistence test file
 * for the full trace/evidence writeup. GET /api/posts/[id]/comments
 * computes `liked` the exact same way (a fresh prisma.commentLike
 * lookup scoped to the real session userId, no time filter, no cache),
 * so the same "backdate and re-read" technique proves it here too.
 */
describe.skipIf(!hasRealDatabaseUrl)(
  "CommentLike persistence over time (integration, real Postgres)",
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
      await prisma.comment.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.post.deleteMany({ where: { id: { in: postIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    async function createUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${runId}@commentlikepersist.example`,
          username: `${label}${runId}`.slice(0, 20),
          password: "x",
        },
      });
      userIds.push(user.id);
      return user;
    }

    async function createCommentedPost(postAuthorId: string, commentAuthorId: string) {
      const post = await prisma.post.create({
        data: { content: `persistence target ${runId}`, authorId: postAuthorId, status: "published" },
      });
      postIds.push(post.id);
      const comment = await prisma.comment.create({
        data: { content: `comment ${runId}`, postId: post.id, authorId: commentAuthorId },
      });
      commentIds.push(comment.id);
      return { post, comment };
    }

    async function backdate(commentId: string, userId: string, hoursAgo: number) {
      await prisma.commentLike.update({
        where: { commentId_userId: { commentId, userId } },
        data: { createdAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000) },
      });
    }

    it("a comment like survives being read back hours later, with a correct count", async () => {
      const postAuthor = await createUser("postauthor1");
      const commentAuthor = await createUser("commentauthor1");
      const liker = await createUser("liker1");
      const { post, comment } = await createCommentedPost(postAuthor.id, commentAuthor.id);
      getServerSession.mockResolvedValue(sessionFor(liker));

      const likeRes = await likeToggle(likeReq(comment.id), { params: Promise.resolve({ id: comment.id }) });
      expect((await likeRes.json()).liked).toBe(true);

      await backdate(comment.id, liker.id, 9);

      const list = await getComments(commentsReq(post.id), { params: Promise.resolve({ id: post.id }) });
      const body = await list.json();
      const found = body.comments.find((c: { id: string }) => c.id === comment.id);
      expect(found).toBeTruthy();
      expect(found.liked).toBe(true);
      expect(found._count.likes).toBe(1);
    });

    it("two different users' comment likes never cross-contaminate, at any age", async () => {
      const postAuthor = await createUser("postauthor2");
      const commentAuthor = await createUser("commentauthor2");
      const likerA = await createUser("likera2");
      const likerB = await createUser("likerb2");
      const { post, comment } = await createCommentedPost(postAuthor.id, commentAuthor.id);

      getServerSession.mockResolvedValue(sessionFor(likerA));
      await likeToggle(likeReq(comment.id), { params: Promise.resolve({ id: comment.id }) });
      await backdate(comment.id, likerA.id, 14);

      getServerSession.mockResolvedValue(sessionFor(likerB));
      const listForB = await getComments(commentsReq(post.id), { params: Promise.resolve({ id: post.id }) });
      const foundForB = (await listForB.json()).comments.find((c: { id: string }) => c.id === comment.id);
      expect(foundForB.liked).toBe(false);

      getServerSession.mockResolvedValue(sessionFor(likerA));
      const listForA = await getComments(commentsReq(post.id), { params: Promise.resolve({ id: post.id }) });
      const foundForA = (await listForA.json()).comments.find((c: { id: string }) => c.id === comment.id);
      expect(foundForA.liked).toBe(true);
    });

    it("a full like/unlike/like cycle with aging at each step remains consistent", async () => {
      const postAuthor = await createUser("postauthor3");
      const commentAuthor = await createUser("commentauthor3");
      const liker = await createUser("liker3");
      const { post, comment } = await createCommentedPost(postAuthor.id, commentAuthor.id);
      getServerSession.mockResolvedValue(sessionFor(liker));

      await likeToggle(likeReq(comment.id), { params: Promise.resolve({ id: comment.id }) });
      await backdate(comment.id, liker.id, 4);
      await likeToggle(likeReq(comment.id), { params: Promise.resolve({ id: comment.id }) }); // unlike

      const afterUnlike = await getComments(commentsReq(post.id), { params: Promise.resolve({ id: post.id }) });
      const foundAfterUnlike = (await afterUnlike.json()).comments.find((c: { id: string }) => c.id === comment.id);
      expect(foundAfterUnlike.liked).toBe(false);

      await likeToggle(likeReq(comment.id), { params: Promise.resolve({ id: comment.id }) }); // relike
      await backdate(comment.id, liker.id, 18);

      const finalRead = await getComments(commentsReq(post.id), { params: Promise.resolve({ id: post.id }) });
      const finalFound = (await finalRead.json()).comments.find((c: { id: string }) => c.id === comment.id);
      expect(finalFound.liked).toBe(true);
      expect(finalFound._count.likes).toBe(1);
    });
  }
);
