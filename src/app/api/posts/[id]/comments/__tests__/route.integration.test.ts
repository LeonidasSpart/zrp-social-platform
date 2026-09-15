import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { POST } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function req(postId: string, body: unknown, ip = "203.0.113.92") {
  return new NextRequest(`https://zrp.one/api/posts/${postId}/comments`, {
    method: "POST",
    headers: { "x-forwarded-for": ip, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function sessionFor(user: { id: string; username: string; name?: string | null; plan?: string }) {
  return { user: { name: null, plan: "free", ...user } };
}

describe.skipIf(!hasRealDatabaseUrl)(
  "POST /api/posts/[id]/comments (integration, real Postgres)",
  () => {
    const runId = randomUUID().slice(0, 8);
    const userIds: string[] = [];
    const postIds: string[] = [];

    afterEach(() => {
      getServerSession.mockReset();
    });

    afterAll(async () => {
      await prisma.notification.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.comment.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.post.deleteMany({ where: { id: { in: postIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    async function createUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${runId}@commenttest.example`,
          username: `${label}${runId}`.slice(0, 20),
          password: "x",
        },
      });
      userIds.push(user.id);
      return user;
    }

    async function createPost(authorId: string) {
      const post = await prisma.post.create({
        data: { content: `comment target ${runId}`, authorId, status: "published" },
      });
      postIds.push(post.id);
      return post;
    }

    it("a top-level comment notifies only the post author", async () => {
      const author = await createUser("author1");
      const commenter = await createUser("commenter1");
      const post = await createPost(author.id);
      getServerSession.mockResolvedValue(sessionFor(commenter));

      const res = await POST(req(post.id, { content: "nice post" }), { params: Promise.resolve({ id: post.id }) });
      expect(res.status).toBe(201);

      const notifs = await prisma.notification.findMany({ where: { postId: post.id, fromUserId: commenter.id } });
      expect(notifs).toHaveLength(1);
      expect(notifs[0].type).toBe("comment");
      expect(notifs[0].userId).toBe(author.id);
    });

    it("a reply notifies BOTH the post author (comment) and the parent comment's author (reply) when they're different people", async () => {
      const author = await createUser("author2");
      const firstCommenter = await createUser("commenter2a");
      const replier = await createUser("commenter2b");
      const post = await createPost(author.id);

      getServerSession.mockResolvedValue(sessionFor(firstCommenter));
      const topLevel = await POST(req(post.id, { content: "first!" }), { params: Promise.resolve({ id: post.id }) });
      const topLevelComment = await topLevel.json();

      getServerSession.mockResolvedValue(sessionFor(replier));
      const reply = await POST(
        req(post.id, { content: "totally agree", parentId: topLevelComment.id }),
        { params: Promise.resolve({ id: post.id }) }
      );
      expect(reply.status).toBe(201);

      const postNotif = await prisma.notification.findFirst({
        where: { userId: author.id, fromUserId: replier.id, type: "comment", postId: post.id },
      });
      expect(postNotif).toBeTruthy();

      const replyNotif = await prisma.notification.findFirst({
        where: { userId: firstCommenter.id, fromUserId: replier.id, type: "reply", postId: post.id },
      });
      expect(replyNotif).toBeTruthy();
    });

    it("a reply to your OWN post's top-level comment does not double-notify you (comment + reply for the same action)", async () => {
      const author = await createUser("author3");
      const replier = await createUser("commenter3");
      const post = await createPost(author.id);

      // The post author comments on their own post first (no
      // notification to self either way).
      getServerSession.mockResolvedValue(sessionFor(author));
      const topLevel = await POST(req(post.id, { content: "my own take" }), { params: Promise.resolve({ id: post.id }) });
      const topLevelComment = await topLevel.json();

      getServerSession.mockResolvedValue(sessionFor(replier));
      await POST(
        req(post.id, { content: "replying to the author's own comment", parentId: topLevelComment.id }),
        { params: Promise.resolve({ id: post.id }) }
      );

      // Only ONE notification total to the author, not two (comment +
      // reply) for what is really a single reply action.
      const notifsToAuthor = await prisma.notification.findMany({
        where: { userId: author.id, fromUserId: replier.id, postId: post.id },
      });
      expect(notifsToAuthor).toHaveLength(1);
    });

    it("mentioning a real user in a comment notifies them, but never the author themself or a nonexistent username", async () => {
      const author = await createUser("author4");
      const commenter = await createUser("commenter4");
      const mentioned = await createUser("mentioned4");
      const post = await createPost(author.id);
      getServerSession.mockResolvedValue(sessionFor(commenter));

      const res = await POST(
        req(post.id, { content: `hey @${mentioned.username} and @totally-nonexistent-user-${runId} check this out` }),
        { params: Promise.resolve({ id: post.id }) }
      );
      expect(res.status).toBe(201);

      const mentionNotif = await prisma.notification.findFirst({
        where: { userId: mentioned.id, fromUserId: commenter.id, type: "mention", postId: post.id },
      });
      expect(mentionNotif).toBeTruthy();

      const totalNotifs = await prisma.notification.count({ where: { postId: post.id, fromUserId: commenter.id } });
      // author (comment) + mentioned (mention) = 2, never a third one
      // for the nonexistent username.
      expect(totalNotifs).toBe(2);
    });
  }
);
