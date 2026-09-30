import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { GET } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function req(postId: string) {
  return new NextRequest(`https://zrp.one/api/posts/${postId}/reaction`);
}

function sessionFor(user: { id: string; username: string }) {
  return { user: { name: null, ...user } };
}

// ⚠️ REGRESSION (master audit): GET had no auth/visibility/block check
// at all - anyone who knew or guessed a post id got the full reactor
// list on a private, blocked, or unpublished post.
describe.skipIf(!hasRealDatabaseUrl)(
  "GET /api/posts/[id]/reaction (integration, real Postgres)",
  () => {
    const runId = randomUUID().slice(0, 8);
    const userIds: string[] = [];
    const postIds: string[] = [];

    afterEach(() => {
      getServerSession.mockReset();
    });

    afterAll(async () => {
      await prisma.reaction.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.blocked.deleteMany({ where: { OR: [{ blockerId: { in: userIds } }, { blockedId: { in: userIds } }] } });
      await prisma.post.deleteMany({ where: { id: { in: postIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    async function createUser(label: string, overrides: Partial<{ isPrivate: boolean }> = {}) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${runId}@reactiontest.example`,
          username: `${label}${runId}`.slice(0, 20),
          password: "x",
          ...overrides,
        },
      });
      userIds.push(user.id);
      return user;
    }

    async function createPost(authorId: string, status = "published") {
      const post = await prisma.post.create({
        data: { content: `reaction target ${runId}`, authorId, status },
      });
      postIds.push(post.id);
      return post;
    }

    it("404s a private account's post for a non-follower", async () => {
      const author = await createUser("privauth", { isPrivate: true });
      const viewer = await createUser("stranger1");
      const post = await createPost(author.id);
      getServerSession.mockResolvedValue(sessionFor(viewer));

      const res = await GET(req(post.id), { params: Promise.resolve({ id: post.id }) });
      expect(res.status).toBe(404);
    });

    it("404s when either party has blocked the other", async () => {
      const author = await createUser("blockauth");
      const viewer = await createUser("blockviewer");
      await prisma.blocked.create({ data: { blockerId: author.id, blockedId: viewer.id } });
      const post = await createPost(author.id);
      getServerSession.mockResolvedValue(sessionFor(viewer));

      const res = await GET(req(post.id), { params: Promise.resolve({ id: post.id }) });
      expect(res.status).toBe(404);
    });

    it("404s an unpublished (scheduled) post", async () => {
      const author = await createUser("schedauth");
      const post = await createPost(author.id, "scheduled");
      getServerSession.mockResolvedValue(null);

      const res = await GET(req(post.id), { params: Promise.resolve({ id: post.id }) });
      expect(res.status).toBe(404);
    });

    it("returns reactions for a public post to an anonymous viewer", async () => {
      const author = await createUser("pubauth");
      const reactor = await createUser("pubreactor");
      const post = await createPost(author.id);
      await prisma.reaction.create({ data: { postId: post.id, userId: reactor.id, emoji: "👍" } });
      getServerSession.mockResolvedValue(null);

      const res = await GET(req(post.id), { params: Promise.resolve({ id: post.id }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.map((r: { userId: string }) => r.userId)).toContain(reactor.id);
    });
  }
);
