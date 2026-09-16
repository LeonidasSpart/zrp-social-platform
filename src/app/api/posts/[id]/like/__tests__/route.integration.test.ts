import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { POST } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function req(postId: string, ip = "203.0.113.91") {
  return new NextRequest(`https://zrp.one/api/posts/${postId}/like`, {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

function sessionFor(user: { id: string; username: string; name?: string | null }) {
  return { user: { name: null, ...user } };
}

describe.skipIf(!hasRealDatabaseUrl)(
  "POST /api/posts/[id]/like (integration, real Postgres)",
  () => {
    const runId = randomUUID().slice(0, 8);
    const userIds: string[] = [];
    const postIds: string[] = [];

    afterEach(() => {
      getServerSession.mockReset();
    });

    afterAll(async () => {
      await prisma.notification.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.like.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.blocked.deleteMany({ where: { OR: [{ blockerId: { in: userIds } }, { blockedId: { in: userIds } }] } });
      await prisma.post.deleteMany({ where: { id: { in: postIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    async function createUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${runId}@liketest.example`,
          username: `${label}${runId}`.slice(0, 20),
          password: "x",
        },
      });
      userIds.push(user.id);
      return user;
    }

    async function createPost(authorId: string) {
      const post = await prisma.post.create({
        data: { content: `like target ${runId}`, authorId, status: "published" },
      });
      postIds.push(post.id);
      return post;
    }

    it("a like -> unlike -> like cycle leaves exactly one unread notification, never a stale orphan or a duplicate", async () => {
      const author = await createUser("author1");
      const liker = await createUser("liker1");
      const post = await createPost(author.id);
      getServerSession.mockResolvedValue(sessionFor(liker));

      const like1 = await POST(req(post.id), { params: Promise.resolve({ id: post.id }) });
      expect((await like1.json()).liked).toBe(true);

      let notifs = await prisma.notification.findMany({
        where: { userId: author.id, fromUserId: liker.id, type: "like", postId: post.id },
      });
      expect(notifs).toHaveLength(1);

      const unlike = await POST(req(post.id), { params: Promise.resolve({ id: post.id }) });
      expect((await unlike.json()).liked).toBe(false);

      notifs = await prisma.notification.findMany({
        where: { userId: author.id, fromUserId: liker.id, type: "like", postId: post.id },
      });
      expect(notifs).toHaveLength(0);

      const like2 = await POST(req(post.id), { params: Promise.resolve({ id: post.id }) });
      expect((await like2.json()).liked).toBe(true);

      notifs = await prisma.notification.findMany({
        where: { userId: author.id, fromUserId: liker.id, type: "like", postId: post.id },
      });
      expect(notifs).toHaveLength(1);
    });

    it("blocks the like itself (not just the notification) for a blocked-either-way relationship", async () => {
      const author = await createUser("author2");
      const liker = await createUser("liker2");
      await prisma.blocked.create({ data: { blockerId: liker.id, blockedId: author.id } });
      const post = await createPost(author.id);
      getServerSession.mockResolvedValue(sessionFor(liker));

      const res = await POST(req(post.id), { params: Promise.resolve({ id: post.id }) });
      expect(res.status).toBe(403);

      const like = await prisma.like.findUnique({ where: { postId_userId: { postId: post.id, userId: liker.id } } });
      expect(like).toBeNull();

      const notif = await prisma.notification.findFirst({
        where: { userId: author.id, fromUserId: liker.id, type: "like", postId: post.id },
      });
      expect(notif).toBeNull();
    });

    it("blocks the like in the other direction too (author blocked the liker)", async () => {
      const author = await createUser("author2b");
      const liker = await createUser("liker2b");
      await prisma.blocked.create({ data: { blockerId: author.id, blockedId: liker.id } });
      const post = await createPost(author.id);
      getServerSession.mockResolvedValue(sessionFor(liker));

      const res = await POST(req(post.id), { params: Promise.resolve({ id: post.id }) });
      expect(res.status).toBe(403);

      const like = await prisma.like.findUnique({ where: { postId_userId: { postId: post.id, userId: liker.id } } });
      expect(like).toBeNull();
    });

    it("a concurrent duplicate like request is idempotent, not a 500, and never produces a duplicate row", async () => {
      const author = await createUser("author3");
      const liker = await createUser("liker3");
      const post = await createPost(author.id);
      getServerSession.mockResolvedValue(sessionFor(liker));

      // Fire two requests "at once". Depending on interleaving this
      // either races two creates (DB unique constraint makes the loser
      // throw P2002, caught and returned as liked:true - not a 500) or
      // one completes before the other starts and the second correctly
      // toggles it back off - either way the real invariant is: no 500,
      // and the final DB state has at most one Like row for this pair.
      const [a, b] = await Promise.all([
        POST(req(post.id), { params: Promise.resolve({ id: post.id }) }),
        POST(req(post.id), { params: Promise.resolve({ id: post.id }) }),
      ]);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);

      const likes = await prisma.like.findMany({ where: { postId: post.id, userId: liker.id } });
      expect(likes.length).toBeLessThanOrEqual(1);
    });
  }
);
