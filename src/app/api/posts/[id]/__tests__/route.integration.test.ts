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
  return new NextRequest(`https://zrp.one/api/posts/${postId}`);
}

function sessionFor(user: { id: string; username: string; name?: string | null; plan?: string }) {
  return { user: { name: null, plan: "free", ...user } };
}

/*
 * Regression coverage for the two gaps found while building the Post
 * Share feature: a canonical /post/{id} link makes the single-post
 * GET route an actively promoted, directly-guessable-by-id entry
 * point, so it needs the same visibility rules the feed already
 * enforces (see /api/posts/route.ts) - not just the private-account
 * check this route already had.
 */
describe.skipIf(!hasRealDatabaseUrl)(
  "GET /api/posts/[id] - visibility hardening (integration, real Postgres)",
  () => {
    const runId = randomUUID().slice(0, 8);
    const userIds: string[] = [];
    const postIds: string[] = [];

    afterEach(() => {
      getServerSession.mockReset();
    });

    afterAll(async () => {
      await prisma.blocked.deleteMany({ where: { OR: [{ blockerId: { in: userIds } }, { blockedId: { in: userIds } }] } });
      await prisma.post.deleteMany({ where: { id: { in: postIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    async function createUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${runId}@sharetest.example`,
          username: `${label}${runId}`.slice(0, 20),
          password: "x",
        },
      });
      userIds.push(user.id);
      return user;
    }

    async function createPost(authorId: string, data: Partial<{ status: string }> = {}) {
      const post = await prisma.post.create({
        data: { content: `share target ${runId}`, authorId, status: "published", ...data },
      });
      postIds.push(post.id);
      return post;
    }

    it("a scheduled (unpublished) post 404s for a stranger who has its direct link", async () => {
      const author = await createUser("author2");
      const stranger = await createUser("stranger1");
      const post = await createPost(author.id, { status: "scheduled" });
      getServerSession.mockResolvedValue(sessionFor(stranger));

      const res = await GET(req(post.id), { params: Promise.resolve({ id: post.id }) });
      expect(res.status).toBe(404);
    });

    it("a scheduled (unpublished) post 404s for a logged-out visitor with its direct link", async () => {
      const author = await createUser("author3");
      const post = await createPost(author.id, { status: "scheduled" });
      getServerSession.mockResolvedValue(null);

      const res = await GET(req(post.id), { params: Promise.resolve({ id: post.id }) });
      expect(res.status).toBe(404);
    });

    it("the author can still fetch their own scheduled post by its direct link", async () => {
      const author = await createUser("author4");
      const post = await createPost(author.id, { status: "scheduled" });
      getServerSession.mockResolvedValue(sessionFor(author));

      const res = await GET(req(post.id), { params: Promise.resolve({ id: post.id }) });
      expect(res.status).toBe(200);
    });

    it("a published post 404s for a user the author has blocked, even via direct link", async () => {
      const author = await createUser("author5");
      const blockedViewer = await createUser("blocked1");
      const post = await createPost(author.id);
      await prisma.blocked.create({ data: { blockerId: author.id, blockedId: blockedViewer.id } });
      getServerSession.mockResolvedValue(sessionFor(blockedViewer));

      const res = await GET(req(post.id), { params: Promise.resolve({ id: post.id }) });
      expect(res.status).toBe(404);
    });

    it("a published post 404s for a viewer who has blocked the author, even via direct link", async () => {
      const author = await createUser("author6");
      const viewerWhoBlocked = await createUser("blocked2");
      const post = await createPost(author.id);
      await prisma.blocked.create({ data: { blockerId: viewerWhoBlocked.id, blockedId: author.id } });
      getServerSession.mockResolvedValue(sessionFor(viewerWhoBlocked));

      const res = await GET(req(post.id), { params: Promise.resolve({ id: post.id }) });
      expect(res.status).toBe(404);
    });

    it("a published post from a public account is still visible to a logged-out visitor via direct link", async () => {
      const author = await createUser("author7");
      const post = await createPost(author.id);
      getServerSession.mockResolvedValue(null);

      const res = await GET(req(post.id), { params: Promise.resolve({ id: post.id }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(post.id);
    });
  }
);
