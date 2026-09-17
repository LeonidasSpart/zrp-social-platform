import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

const { getToken } = vi.hoisted(() => ({ getToken: vi.fn() }));
vi.mock("next-auth/jwt", () => ({ getToken }));

import { POST as likeToggle } from "../route";
import { GET as getPostDetail } from "../../route";
import { GET as getMainFeed } from "../../../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function likeReq(postId: string, ip = "203.0.113.95") {
  return new NextRequest(`https://zrp.one/api/posts/${postId}/like`, {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

function postDetailReq(postId: string) {
  return new NextRequest(`https://zrp.one/api/posts/${postId}`);
}

function mainFeedReq() {
  return new NextRequest("https://zrp.one/api/posts?tab=for-you");
}

function sessionFor(user: { id: string; username: string; name?: string | null }) {
  return { user: { name: null, ...user } };
}

/*
 * ============================================================
 * Regression coverage: "a like appears to disappear hours later"
 * ============================================================
 *
 * Investigated a production report that a post/comment like shows
 * correctly right after tapping it, but reads back as un-liked hours
 * later. A full trace of every read path that computes `liked`
 * (src/app/api/posts/route.ts, posts/feed, posts/explore,
 * posts/[id]/route.ts, videos/route.ts, src/lib/discover/feed.ts,
 * src/lib/post-card-feed.ts) confirmed every one of them queries
 * `prisma.like`/`prisma.commentLike` fresh, scoped to the current
 * session's real userId, with no time-window filter and no caching of
 * per-user like state anywhere (Redis is used only for the shared
 * ranked-list/candidate-pool payload, which every one of those routes
 * documents computing `liked` OUTSIDE of, specifically so a like is
 * never held hostage by a cache TTL). No cron/background job in
 * src/app/api/cron touches Like or CommentLike at all.
 *
 * These tests make that evidence concrete and repeatable: a Like row's
 * age (simulated by backdating createdAt, since a real wait is
 * impractical in CI) must never affect whether it's found, and no
 * amount of read-path variety, cache absence, concurrent activity, or
 * unrelated background account cleanup should be able to make an
 * existing Like row invisible.
 */
describe.skipIf(!hasRealDatabaseUrl)(
  "Like persistence over time (integration, real Postgres)",
  () => {
    const runId = randomUUID().slice(0, 8);
    const userIds: string[] = [];
    const postIds: string[] = [];

    afterEach(() => {
      getServerSession.mockReset();
      getToken.mockReset();
    });

    afterAll(async () => {
      await prisma.notification.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.like.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.post.deleteMany({ where: { id: { in: postIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    async function createUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${runId}@likepersist.example`,
          username: `${label}${runId}`.slice(0, 20),
          password: "x",
        },
      });
      userIds.push(user.id);
      return user;
    }

    async function createPost(authorId: string, extra: Record<string, unknown> = {}) {
      const post = await prisma.post.create({
        data: { content: `persistence target ${runId}`, authorId, status: "published", ...extra },
      });
      postIds.push(post.id);
      return post;
    }

    /** Simulates "hours later" without literally waiting in CI. */
    async function backdate(postId: string, userId: string, hoursAgo: number) {
      await prisma.like.update({
        where: { postId_userId: { postId, userId } },
        data: { createdAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000) },
      });
    }

    it("a like survives being read back hours later on the post-detail endpoint, with a correct count", async () => {
      const author = await createUser("author1");
      const liker = await createUser("liker1");
      const post = await createPost(author.id);
      getServerSession.mockResolvedValue(sessionFor(liker));

      const likeRes = await likeToggle(likeReq(post.id), { params: Promise.resolve({ id: post.id }) });
      expect((await likeRes.json()).liked).toBe(true);

      await backdate(post.id, liker.id, 10);

      const detail = await getPostDetail(postDetailReq(post.id), { params: Promise.resolve({ id: post.id }) });
      const body = await detail.json();
      expect(body.liked).toBe(true);
      expect(body._count.likes).toBe(1);
    });

    it("a like survives being read back hours later on the main feed endpoint", async () => {
      const author = await createUser("author2");
      const liker = await createUser("liker2");
      const post = await createPost(author.id);
      getServerSession.mockResolvedValue(sessionFor(liker));

      await likeToggle(likeReq(post.id), { params: Promise.resolve({ id: post.id }) });
      await backdate(post.id, liker.id, 12);

      getToken.mockResolvedValue({ id: liker.id });
      const feedRes = await getMainFeed(mainFeedReq());
      const feedBody = await feedRes.json();
      const found = feedBody.posts.find((p: { id: string }) => p.id === post.id);
      expect(found).toBeTruthy();
      expect(found.liked).toBe(true);
    });

    it("an image/media post's like persists and reads back correctly, through the same Like model and endpoints as a text post", async () => {
      const author = await createUser("author3");
      const liker = await createUser("liker3");
      // A post with real media set - proves media posts use the exact
      // same Post row / Like model / routes as a plain text post, not a
      // separate implementation that could have its own persistence bug.
      const post = await createPost(author.id, {
        imageUrl: "https://utfs.io/f/test-image.jpg",
        mediaType: "image",
      });
      getServerSession.mockResolvedValue(sessionFor(liker));

      const likeRes = await likeToggle(likeReq(post.id), { params: Promise.resolve({ id: post.id }) });
      expect((await likeRes.json()).liked).toBe(true);

      await backdate(post.id, liker.id, 8);

      const detail = await getPostDetail(postDetailReq(post.id), { params: Promise.resolve({ id: post.id }) });
      const body = await detail.json();
      expect(body.liked).toBe(true);
      expect(body.mediaType).toBe("image");
    });

    it("two different users' likes on the same post never cross-contaminate, at any age", async () => {
      const author = await createUser("author4");
      const likerA = await createUser("likera4");
      const likerB = await createUser("likerb4");
      const post = await createPost(author.id);

      getServerSession.mockResolvedValue(sessionFor(likerA));
      await likeToggle(likeReq(post.id), { params: Promise.resolve({ id: post.id }) });
      await backdate(post.id, likerA.id, 20);

      // likerB never liked it - must read back as false, not somehow
      // pick up likerA's row.
      getServerSession.mockResolvedValue(sessionFor(likerB));
      const detailForB = await getPostDetail(postDetailReq(post.id), { params: Promise.resolve({ id: post.id }) });
      expect((await detailForB.json()).liked).toBe(false);

      // likerA's own like must still read back true.
      getServerSession.mockResolvedValue(sessionFor(likerA));
      const detailForA = await getPostDetail(postDetailReq(post.id), { params: Promise.resolve({ id: post.id }) });
      const bodyForA = await detailForA.json();
      expect(bodyForA.liked).toBe(true);
      expect(bodyForA._count.likes).toBe(1);
    });

    it("unlike removes ONLY the authenticated user's own like, never another user's", async () => {
      const author = await createUser("author5");
      const likerA = await createUser("likera5");
      const likerB = await createUser("likerb5");
      const post = await createPost(author.id);

      getServerSession.mockResolvedValue(sessionFor(likerA));
      await likeToggle(likeReq(post.id), { params: Promise.resolve({ id: post.id }) });
      getServerSession.mockResolvedValue(sessionFor(likerB));
      await likeToggle(likeReq(post.id), { params: Promise.resolve({ id: post.id }) });

      await backdate(post.id, likerA.id, 5);
      await backdate(post.id, likerB.id, 5);

      // likerA unlikes.
      getServerSession.mockResolvedValue(sessionFor(likerA));
      const unlikeRes = await likeToggle(likeReq(post.id), { params: Promise.resolve({ id: post.id }) });
      expect((await unlikeRes.json()).liked).toBe(false);

      // likerB's like must be completely unaffected.
      const likerBRow = await prisma.like.findUnique({
        where: { postId_userId: { postId: post.id, userId: likerB.id } },
      });
      expect(likerBRow).toBeTruthy();

      const likerARow = await prisma.like.findUnique({
        where: { postId_userId: { postId: post.id, userId: likerA.id } },
      });
      expect(likerARow).toBeNull();
    });

    it("an unrelated user's account deletion never removes another user's like on another user's post", async () => {
      const author = await createUser("author6");
      const liker = await createUser("liker6");
      const bystander = await createUser("bystander6");
      const post = await createPost(author.id);

      getServerSession.mockResolvedValue(sessionFor(liker));
      await likeToggle(likeReq(post.id), { params: Promise.resolve({ id: post.id }) });
      await backdate(post.id, liker.id, 6);

      // Simulates the one real background job that ever deletes a User
      // row (src/app/api/cron/delete-scheduled-accounts) touching a
      // completely unrelated third party - the liker's own row and
      // Like must be untouched by cascade or by any bulk cleanup logic.
      await prisma.user.delete({ where: { id: bystander.id } });
      userIds.splice(userIds.indexOf(bystander.id), 1);

      const stillThere = await prisma.like.findUnique({
        where: { postId_userId: { postId: post.id, userId: liker.id } },
      });
      expect(stillThere).toBeTruthy();

      const detail = await getPostDetail(postDetailReq(post.id), { params: Promise.resolve({ id: post.id }) });
      expect((await detail.json()).liked).toBe(true);
    });

    it("repeated like/unlike/like cycles remain consistent even when each state is aged", async () => {
      const author = await createUser("author7");
      const liker = await createUser("liker7");
      const post = await createPost(author.id);
      getServerSession.mockResolvedValue(sessionFor(liker));

      await likeToggle(likeReq(post.id), { params: Promise.resolve({ id: post.id }) });
      await backdate(post.id, liker.id, 3);
      await likeToggle(likeReq(post.id), { params: Promise.resolve({ id: post.id }) }); // unlike
      const afterUnlike = await getPostDetail(postDetailReq(post.id), { params: Promise.resolve({ id: post.id }) });
      expect((await afterUnlike.json()).liked).toBe(false);

      const relike = await likeToggle(likeReq(post.id), { params: Promise.resolve({ id: post.id }) });
      expect((await relike.json()).liked).toBe(true);
      await backdate(post.id, liker.id, 15);

      const finalRead = await getPostDetail(postDetailReq(post.id), { params: Promise.resolve({ id: post.id }) });
      const finalBody = await finalRead.json();
      expect(finalBody.liked).toBe(true);
      expect(finalBody._count.likes).toBe(1);
    });

    it("a concurrent duplicate like request is idempotent at any subsequent read, no matter how the race resolved", async () => {
      const author = await createUser("author8");
      const liker = await createUser("liker8");
      const post = await createPost(author.id);
      getServerSession.mockResolvedValue(sessionFor(liker));

      await Promise.all([
        likeToggle(likeReq(post.id), { params: Promise.resolve({ id: post.id }) }),
        likeToggle(likeReq(post.id), { params: Promise.resolve({ id: post.id }) }),
      ]);

      const rows = await prisma.like.findMany({ where: { postId: post.id, userId: liker.id } });
      // Whichever way the race landed (both liked, or like+unlike), the
      // persisted row count and the read-back `liked` flag must agree -
      // this is the actual invariant, not a specific expected outcome.
      const detail = await getPostDetail(postDetailReq(post.id), { params: Promise.resolve({ id: post.id }) });
      const body = await detail.json();
      expect(body.liked).toBe(rows.length === 1);
      expect(body._count.likes).toBe(rows.length);
    });
  }
);
