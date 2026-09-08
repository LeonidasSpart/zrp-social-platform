import { describe, it, expect, vi, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { GET } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function req(tag: string, query: Record<string, string> = {}) {
  const url = new URL(`https://zrp.one/api/posts/hashtag/${tag}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

function call(tag: string, query: Record<string, string> = {}) {
  return GET(req(tag, query), { params: Promise.resolve({ tag }) });
}

// Regression coverage for the hashtag timeline's "no pagination" gap
// (ios-native/PARITY.md, "Hashtag timeline" row): GET
// /api/posts/hashtag/{tag} always ran `take: 50` with no way to reach
// anything older, unlike every other feed in this app that supports
// cursor pagination. Fixed the same backward-compatible way as GET
// /api/messages/{userId}: a request with neither `cursor` nor `limit`
// (what the live web app sends today) gets the unchanged bare array,
// capped at the same historical 50; a request that supplies either gets
// the {items,nextCursor} envelope.
describe.skipIf(!hasRealDatabaseUrl)(
  "GET /api/posts/hashtag/[tag] (integration, real Postgres)",
  () => {
    const userIds: string[] = [];
    const postIds: string[] = [];
    const tag = `pagtest${randomUUID().slice(0, 8)}`;

    async function createUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${randomUUID().slice(0, 8)}@hashtagpagtest.example`,
          username: `${label}${randomUUID().slice(0, 6)}`.slice(0, 20),
          password: "x",
          role: "USER",
        },
      });
      userIds.push(user.id);
      return user;
    }

    async function createPost(authorId: string, offsetMs: number) {
      const post = await prisma.post.create({
        data: {
          id: randomUUID(),
          content: `post about #${tag}`,
          authorId,
          status: "published",
          hashtags: [tag],
          createdAt: new Date(Date.now() - offsetMs),
        },
      });
      postIds.push(post.id);
      return post;
    }

    afterAll(async () => {
      await prisma.post.deleteMany({ where: { id: { in: postIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    it("returns a bare array capped at 50 when no cursor/limit is sent (legacy shape)", async () => {
      const author = await createUser("legacy");
      await createPost(author.id, 2000);
      await createPost(author.id, 1000);

      getServerSession.mockResolvedValue(null);
      const res = await call(tag);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(2);
      // Newest first.
      expect(new Date(body[0].createdAt).getTime()).toBeGreaterThan(new Date(body[1].createdAt).getTime());
    });

    it("returns an {items,nextCursor} envelope and pages through older posts when limit is sent", async () => {
      const author = await createUser("paged");
      const pagedTag = `pagtest2${randomUUID().slice(0, 8)}`;
      const posts = [];
      for (let i = 0; i < 3; i++) {
        const post = await prisma.post.create({
          data: {
            id: randomUUID(),
            content: `post ${i} about #${pagedTag}`,
            authorId: author.id,
            status: "published",
            hashtags: [pagedTag],
            createdAt: new Date(Date.now() - (3 - i) * 1000),
          },
        });
        postIds.push(post.id);
        posts.push(post);
      }

      getServerSession.mockResolvedValue(null);

      const firstPage = await call(pagedTag, { limit: "2" });
      const firstBody = await firstPage.json();
      expect(firstBody.items).toHaveLength(2);
      expect(firstBody.nextCursor).toBeTruthy();
      // Newest two: posts[2] then posts[1].
      expect(firstBody.items[0].id).toBe(posts[2].id);
      expect(firstBody.items[1].id).toBe(posts[1].id);

      const secondPage = await call(pagedTag, { limit: "2", cursor: firstBody.nextCursor });
      const secondBody = await secondPage.json();
      expect(secondBody.items).toHaveLength(1);
      expect(secondBody.items[0].id).toBe(posts[0].id);
      expect(secondBody.nextCursor).toBeNull();
    });

    it("attaches the viewer's own liked status in both the legacy and paginated shapes", async () => {
      const author = await createUser("likedauthor");
      const viewer = await createUser("likedviewer");
      const likedTag = `pagtest3${randomUUID().slice(0, 8)}`;
      const post = await prisma.post.create({
        data: {
          id: randomUUID(),
          content: `liked post about #${likedTag}`,
          authorId: author.id,
          status: "published",
          hashtags: [likedTag],
        },
      });
      postIds.push(post.id);
      await prisma.like.create({ data: { id: randomUUID(), userId: viewer.id, postId: post.id } });

      getServerSession.mockResolvedValue({ user: { id: viewer.id } });

      const legacy = await call(likedTag);
      const legacyBody = await legacy.json();
      expect(legacyBody[0].liked).toBe(true);

      const paged = await call(likedTag, { limit: "10" });
      const pagedBody = await paged.json();
      expect(pagedBody.items[0].liked).toBe(true);
    });
  }
);
