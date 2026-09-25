import { describe, it, expect, vi, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getToken } = vi.hoisted(() => ({ getToken: vi.fn() }));
vi.mock("next-auth/jwt", () => ({ getToken }));

import { GET, POST } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function feedReq(tab: string) {
  return new NextRequest(`https://zrp.one/api/posts?tab=${tab}`);
}

function createReq(body: unknown) {
  return new NextRequest("https://zrp.one/api/posts", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
    body: JSON.stringify(body),
  });
}

/*
 * ⚠️ SECURITY regression coverage for GET/POST /api/posts:
 *  - GET never applied premium gating (the Following tab on web and
 *    native returned paid posts' full content/media/article body), and
 *    its default tab ignored User.isPrivate (any visitor saw private
 *    accounts' posts).
 *  - POST stored `applyUrl` verbatim (javascript: stored XSS on the
 *    recruitment card's Apply link) and `quotePostId` unchecked
 *    (re-publishing a private/scheduled post's content via a quote,
 *    or a 500 on an unknown id).
 */
describe.skipIf(!hasRealDatabaseUrl)(
  "GET/POST /api/posts - visibility, premium gating, create validation (integration, real Postgres)",
  () => {
    const suffix = randomUUID().slice(0, 8);
    const userIds: string[] = [];
    const postIds: string[] = [];
    const creatorProfileIds: string[] = [];

    afterAll(async () => {
      await prisma.premiumPost.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.post.deleteMany({ where: { authorId: { in: userIds } } });
      await prisma.creatorProfile.deleteMany({ where: { id: { in: creatorProfileIds } } });
      await prisma.follow.deleteMany({ where: { OR: [{ followerId: { in: userIds } }, { followingId: { in: userIds } }] } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    async function createUser(label: string, data: Record<string, unknown> = {}) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${suffix}@feedvisibilitytest.example`,
          username: `${label}${suffix}`.slice(0, 20),
          password: "x",
          emailVerified: new Date(),
          ...data,
        },
      });
      userIds.push(user.id);
      return user;
    }

    async function createPost(authorId: string, data: Record<string, unknown> = {}) {
      const post = await prisma.post.create({
        data: { authorId, content: "hello", status: "published", ...data },
      });
      postIds.push(post.id);
      return post;
    }

    it("redacts a premium article's content and body on the Following tab for a non-purchaser", async () => {
      const creator = await createUser("fvcreator");
      const viewer = await createUser("fvviewer");
      await prisma.follow.create({ data: { followerId: viewer.id, followingId: creator.id } });
      const post = await createPost(creator.id, {
        content: "SECRET teaser text",
        body: "<p>SECRET PAID ARTICLE</p>",
        type: "ARTICLE",
      });
      const profile = await prisma.creatorProfile.create({ data: { userId: creator.id, premiumPostsEnabled: true } });
      creatorProfileIds.push(profile.id);
      await prisma.premiumPost.create({
        data: { postId: post.id, creatorProfileId: profile.id, price: 3, previewContent: "unlock me" },
      });

      getToken.mockResolvedValue({ id: viewer.id });
      const body = await (await GET(feedReq("following"))).json();
      const found = body.posts.find((p: { id: string }) => p.id === post.id);

      expect(found).toBeDefined();
      expect(found.content).toBe("unlock me");
      expect(found.body).toBeNull();
      expect(found.premiumPost.locked).toBe(true);
    });

    it("never returns a private account's posts on the default tab to anonymous or non-follower viewers", async () => {
      const owner = await createUser("fvprivate", { isPrivate: true });
      const stranger = await createUser("fvstranger");
      const post = await createPost(owner.id, { content: "private thoughts" });

      for (const token of [null, { id: stranger.id }]) {
        getToken.mockResolvedValue(token);
        const body = await (await GET(feedReq("for-you"))).json();
        expect(body.posts.map((p: { id: string }) => p.id)).not.toContain(post.id);
      }

      getToken.mockResolvedValue({ id: owner.id });
      const own = await (await GET(feedReq("for-you"))).json();
      expect(own.posts.map((p: { id: string }) => p.id)).toContain(post.id);
    });

    it("rejects a javascript: applyUrl on a recruitment post", async () => {
      const recruiter = await createUser("fvrecruit", { plan: "business" });
      getToken.mockResolvedValue({ id: recruiter.id, name: "r" });

      const res = await POST(
        createReq({ content: "hiring", type: "RECRUITMENT", company: "Acme", applyUrl: "javascript:alert(document.cookie)" })
      );
      expect(res.status).toBe(400);
      expect(await prisma.post.count({ where: { authorId: recruiter.id } })).toBe(0);

      const ok = await POST(
        createReq({ content: "hiring", type: "RECRUITMENT", company: "Acme", applyUrl: "https://acme.example/jobs" })
      );
      expect(ok.status).toBe(201);
    });

    it("refuses to quote a private account's post, a scheduled post, or an unknown id - but allows a public one", async () => {
      const quoter = await createUser("fvquoter");
      const privateOwner = await createUser("fvprivq", { isPrivate: true });
      const publicOwner = await createUser("fvpubq");
      await prisma.follow.create({ data: { followerId: quoter.id, followingId: privateOwner.id } });

      const privatePost = await createPost(privateOwner.id, { content: "for followers only" });
      const scheduledPost = await createPost(publicOwner.id, { content: "not yet", status: "scheduled", scheduledAt: new Date(Date.now() + 3600_000) });
      const publicPost = await createPost(publicOwner.id, { content: "public" });

      getToken.mockResolvedValue({ id: quoter.id, name: "q" });
      for (const quotePostId of [privatePost.id, scheduledPost.id, "does-not-exist"]) {
        const res = await POST(createReq({ content: "look", quotePostId }));
        expect(res.status).toBe(400);
      }
      expect(await prisma.post.count({ where: { authorId: quoter.id } })).toBe(0);

      const ok = await POST(createReq({ content: "look", quotePostId: publicPost.id }));
      expect(ok.status).toBe(201);
    });
  }
);
