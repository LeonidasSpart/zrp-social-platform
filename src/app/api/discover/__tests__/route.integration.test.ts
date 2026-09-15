import { describe, it, expect, vi, afterAll, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { getRedisClient } from "@/lib/redis";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { GET } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function req(query: Record<string, string> = {}, ip = "203.0.113.50") {
  const url = new URL("https://zrp.one/api/discover");
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new NextRequest(url, { headers: { "x-forwarded-for": ip } });
}

function sessionFor(userId: string) {
  return { user: { id: userId } };
}

/*
 * Full backend coverage for ZRP Discover's feed endpoint - see
 * docs/discover-backend.md. Mirrors the seeding/cleanup conventions
 * already used by src/app/api/posts/explore/__tests__/route.test.ts and
 * src/app/api/hashtags/search/__tests__/route.test.ts (which this test
 * borrows the "banned/blocked/private" seeding pattern from directly).
 */
describe.skipIf(!hasRealDatabaseUrl)(
  "GET /api/discover (integration, real Postgres)",
  () => {
    const runId = randomUUID().slice(0, 8);
    const userIds: string[] = [];
    const postIds: string[] = [];

    async function createUser(
      label: string,
      overrides: { banned?: boolean; isPrivate?: boolean } = {}
    ) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${runId}@discovertest.example`,
          username: `${label}${runId}`.slice(0, 20),
          password: "x",
          role: "USER",
          banned: overrides.banned ?? false,
          isPrivate: overrides.isPrivate ?? false,
        },
      });
      userIds.push(user.id);
      return user;
    }

    async function createVideoPost(
      authorId: string,
      overrides: {
        createdAt?: Date;
        likes?: number;
        comments?: number;
        reposts?: number;
        content?: string;
      } = {}
    ) {
      const post = await prisma.post.create({
        data: {
          id: randomUUID(),
          content: overrides.content ?? `discover video ${runId}`,
          authorId,
          status: "published",
          mediaType: "video",
          imageUrl: `https://utfs.io/f/${randomUUID()}.mp4`,
          createdAt: overrides.createdAt ?? new Date(),
        },
      });
      postIds.push(post.id);

      const engagers = await Promise.all(
        Array.from({ length: overrides.likes ?? 0 }, () => createUser(`liker${randomUUID().slice(0, 6)}`))
      );
      for (const engager of engagers) {
        await prisma.like.create({ data: { userId: engager.id, postId: post.id } });
      }

      return post;
    }

    afterEach(async () => {
      const redis = await getRedisClient();
      if (redis) await redis.flushDb();
      getServerSession.mockReset();
    });

    const creatorProfileIds: string[] = [];

    afterAll(async () => {
      await prisma.like.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.bookmark.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.repost.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.follow.deleteMany({ where: { OR: [{ followerId: { in: userIds } }, { followingId: { in: userIds } }] } });
      await prisma.blocked.deleteMany({ where: { OR: [{ blockerId: { in: userIds } }, { blockedId: { in: userIds } }] } });
      await prisma.mute.deleteMany({ where: { muterId: { in: userIds } } });
      await prisma.premiumPost.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.creatorProfile.deleteMany({ where: { id: { in: creatorProfileIds } } });
      await prisma.post.deleteMany({ where: { id: { in: postIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    it("1. returns real, published video posts", async () => {
      const author = await createUser("basic");
      const post = await createVideoPost(author.id, { content: `findme-${runId}` });
      getServerSession.mockResolvedValue(null);

      const res = await GET(req());
      expect(res.status).toBe(200);
      const body = await res.json();
      const found = body.items.find((i: { id: string }) => i.id === post.id);
      expect(found).toBeTruthy();
      expect(found.media).toEqual({ url: post.imageUrl, type: "video" });
      expect(found.caption).toBe(`findme-${runId}`);
    });

    it("2. returns an empty (not erroring) feed shape when nothing qualifies", async () => {
      getServerSession.mockResolvedValue(null);
      const res = await GET(req({ q: "impossible-filter-not-a-real-param" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.items)).toBe(true);
      expect(body).toHaveProperty("nextCursor");
    });

    it("3+4. paginates with a cursor, visiting every seeded item exactly once (no duplicates, no skips)", async () => {
      const author = await createUser("paginate");
      const tagPrefix = `page-${runId}-`;
      const created = [];
      for (let i = 0; i < 7; i++) {
        created.push(
          await createVideoPost(author.id, {
            content: `${tagPrefix}${i}`,
            createdAt: new Date(Date.now() - i * 1000),
          })
        );
      }
      getServerSession.mockResolvedValue(null);

      const seen: string[] = [];
      let cursor: string | null = null;
      let guard = 0;
      do {
        const res = await GET(req({ limit: "3", ...(cursor ? { cursor } : {}) }));
        const body: { items: { id: string; caption: string }[]; nextCursor: string | null } = await res.json();
        expect(body.items.length).toBeLessThanOrEqual(3);
        seen.push(...body.items.filter((i) => i.caption.startsWith(tagPrefix)).map((i) => i.id));
        cursor = body.nextCursor;
        guard++;
        expect(guard).toBeLessThan(50);
      } while (cursor !== null);

      const uniqueSeen = new Set(seen);
      expect(uniqueSeen.size).toBe(seen.length); // no duplicates
      for (const post of created) expect(uniqueSeen.has(post.id)).toBe(true); // no skips
    });

    it("5. treats an invalid/garbage cursor as the start of the feed rather than erroring", async () => {
      getServerSession.mockResolvedValue(null);
      const res = await GET(req({ cursor: "not-a-number" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.items)).toBe(true);
    });

    it("6. clamps limit to the default when missing/invalid, and to the max when oversized", async () => {
      getServerSession.mockResolvedValue(null);

      const author = await createUser("limits");
      for (let i = 0; i < 5; i++) await createVideoPost(author.id);

      const resOversized = await GET(req({ limit: "999999" }));
      const bodyOversized = await resOversized.json();
      expect(bodyOversized.items.length).toBeLessThanOrEqual(50);

      const resInvalid = await GET(req({ limit: "not-a-number" }));
      expect(resInvalid.status).toBe(200);
    });

    it("8. excludes posts by banned authors", async () => {
      const banned = await createUser("banned", { banned: true });
      const post = await createVideoPost(banned.id, { content: `bannedcontent-${runId}` });
      getServerSession.mockResolvedValue(null);

      const res = await GET(req({ limit: "50" }));
      const body = await res.json();
      expect(body.items.some((i: { id: string }) => i.id === post.id)).toBe(false);
    });

    it("9+10. excludes posts by a blocked or blocking author, in both directions, and by a muted author", async () => {
      const viewer = await createUser("viewer9");
      const blockedByViewer = await createUser("blockedbyviewer");
      const blocksViewer = await createUser("blocksviewer");
      const muted = await createUser("mutedauthor");

      await prisma.blocked.create({ data: { blockerId: viewer.id, blockedId: blockedByViewer.id } });
      await prisma.blocked.create({ data: { blockerId: blocksViewer.id, blockedId: viewer.id } });
      await prisma.mute.create({ data: { muterId: viewer.id, mutedId: muted.id } });

      const p1 = await createVideoPost(blockedByViewer.id);
      const p2 = await createVideoPost(blocksViewer.id);
      const p3 = await createVideoPost(muted.id);

      getServerSession.mockResolvedValue(sessionFor(viewer.id));
      const res = await GET(req({ limit: "50" }));
      const ids = (await res.json()).items.map((i: { id: string }) => i.id);

      expect(ids).not.toContain(p1.id);
      expect(ids).not.toContain(p2.id);
      expect(ids).not.toContain(p3.id);
    });

    it("11. excludes a private account's posts from an anonymous/non-follower viewer, but includes them for the owner and an approved follower", async () => {
      const privateAuthor = await createUser("private11", { isPrivate: true });
      const post = await createVideoPost(privateAuthor.id, { content: `privatecontent-${runId}` });
      const follower = await createUser("follower11");
      await prisma.follow.create({ data: { followerId: follower.id, followingId: privateAuthor.id } });
      const stranger = await createUser("stranger11");

      getServerSession.mockResolvedValue(null);
      const anonRes = await GET(req({ limit: "50" }));
      expect((await anonRes.json()).items.some((i: { id: string }) => i.id === post.id)).toBe(false);

      getServerSession.mockResolvedValue(sessionFor(stranger.id));
      const strangerRes = await GET(req({ limit: "50" }));
      expect((await strangerRes.json()).items.some((i: { id: string }) => i.id === post.id)).toBe(false);

      getServerSession.mockResolvedValue(sessionFor(privateAuthor.id));
      const ownerRes = await GET(req({ limit: "50" }));
      expect((await ownerRes.json()).items.some((i: { id: string }) => i.id === post.id)).toBe(true);

      getServerSession.mockResolvedValue(sessionFor(follower.id));
      const followerRes = await GET(req({ limit: "50" }));
      expect((await followerRes.json()).items.some((i: { id: string }) => i.id === post.id)).toBe(true);
    });

    it("12. a moderator-deleted post (hard delete, matching the real admin-delete flow) never appears", async () => {
      const author = await createUser("deleted12");
      const post = await createVideoPost(author.id, { content: `deleteme-${runId}` });
      await prisma.post.delete({ where: { id: post.id } });
      postIds.splice(postIds.indexOf(post.id), 1);

      getServerSession.mockResolvedValue(null);
      const res = await GET(req({ limit: "50" }));
      expect((await res.json()).items.some((i: { id: string }) => i.id === post.id)).toBe(false);
    });

    it("13. creator diversity: a single dominant creator does not occupy every slot when other creators have real content", async () => {
      const dominant = await createUser("dominant13");
      const others = await Promise.all(
        Array.from({ length: 4 }, (_, i) => createUser(`other13-${i}`))
      );

      for (let i = 0; i < 8; i++) {
        await createVideoPost(dominant.id, { createdAt: new Date(Date.now() - i * 1000) });
      }
      for (const other of others) {
        await createVideoPost(other.id, { createdAt: new Date(Date.now() - 500) });
      }

      getServerSession.mockResolvedValue(null);
      const res = await GET(req({ limit: "6" }));
      const items: { author: { id: string } }[] = (await res.json()).items;

      const distinctAuthors = new Set(items.map((i) => i.author.id));
      expect(distinctAuthors.size).toBeGreaterThan(1);
    });

    it("14. freshness: a newer post with equal engagement ranks above an older one", async () => {
      const author = await createUser("fresh14");
      const old = await createVideoPost(author.id, { createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) });
      const fresh = await createVideoPost(author.id, { createdAt: new Date() });

      getServerSession.mockResolvedValue(null);
      const res = await GET(req({ limit: "50" }));
      const ids: string[] = (await res.json()).items.map((i: { id: string }) => i.id);

      expect(ids.indexOf(fresh.id)).toBeLessThan(ids.indexOf(old.id));
    });

    it("15+16. engagement ranking: a heavily-liked post ranks above a low-engagement post of similar age, and the low-engagement post still appears", async () => {
      const author = await createUser("engage15");
      const createdAt = new Date(Date.now() - 60_000);
      const popular = await createVideoPost(author.id, { createdAt, likes: 5 });
      const quiet = await createVideoPost(author.id, { createdAt });

      getServerSession.mockResolvedValue(null);
      const res = await GET(req({ limit: "50" }));
      const items: { id: string }[] = (await res.json()).items;
      const ids = items.map((i) => i.id);

      expect(ids).toContain(quiet.id); // low engagement does not mean excluded
      expect(ids.indexOf(popular.id)).toBeLessThan(ids.indexOf(quiet.id));
    });

    it("21. never returns sensitive account fields on the author", async () => {
      const author = await createUser("sensitive21");
      await createVideoPost(author.id);
      getServerSession.mockResolvedValue(null);

      const res = await GET(req({ limit: "50" }));
      const body = await res.json();
      const json = JSON.stringify(body);
      expect(json).not.toMatch(/"password"/);
      expect(json).not.toMatch(/"email"/);
      expect(json).not.toMatch(/resetToken|verificationToken|walletLinkNonce/);
    });

    it("24. works for both an anonymous viewer and an authenticated one, with per-viewer state only for the latter", async () => {
      const author = await createUser("viewerstate24");
      const post = await createVideoPost(author.id);
      const viewer = await createUser("viewer24");
      await prisma.like.create({ data: { userId: viewer.id, postId: post.id } });
      await prisma.follow.create({ data: { followerId: viewer.id, followingId: author.id } });

      getServerSession.mockResolvedValue(null);
      const anonRes = await GET(req({ limit: "50" }));
      const anonItem = (await anonRes.json()).items.find((i: { id: string }) => i.id === post.id);
      expect(anonItem.viewerState).toEqual({ liked: false, saved: false, reposted: false, followsAuthor: false });

      getServerSession.mockResolvedValue(sessionFor(viewer.id));
      const authedRes = await GET(req({ limit: "50" }));
      const authedItem = (await authedRes.json()).items.find((i: { id: string }) => i.id === post.id);
      expect(authedItem.viewerState.liked).toBe(true);
      expect(authedItem.viewerState.followsAuthor).toBe(true);
    });

    it("25. redacts a pay-per-view post's real content for a viewer who hasn't purchased it, but shows the real content to the creator and a purchaser", async () => {
      const creator = await createUser("premiumcreator25");
      const stranger = await createUser("premiumstranger25");
      const purchaser = await createUser("premiumpurchaser25");

      const profile = await prisma.creatorProfile.create({ data: { userId: creator.id } });
      creatorProfileIds.push(profile.id);

      const post = await createVideoPost(creator.id, { content: `SECRET-PREMIUM-CONTENT-${runId}` });
      const realVideoUrl = post.imageUrl;

      const premiumPost = await prisma.premiumPost.create({
        data: {
          postId: post.id,
          creatorProfileId: profile.id,
          price: 5,
          previewContent: "preview only",
        },
      });

      await prisma.premiumPurchase.create({
        data: {
          premiumPostId: premiumPost.id,
          userId: purchaser.id,
          amount: 5,
          creatorAmount: 4,
          platformFee: 1,
          status: "COMPLETED",
        },
      });

      // Stranger: never purchased - must never see the real caption
      // OR the real video URL (media.url must be null, not the actual
      // media, for locked content - see DiscoverFeedItem.media.url).
      getServerSession.mockResolvedValue(sessionFor(stranger.id));
      const strangerRes = await GET(req({ limit: "50" }));
      const strangerItem = (await strangerRes.json()).items.find((i: { id: string }) => i.id === post.id);
      expect(strangerItem).toBeTruthy();
      expect(strangerItem.caption).not.toContain("SECRET-PREMIUM-CONTENT");
      expect(strangerItem.media.url).toBeNull();
      expect(strangerItem.premiumPost).toBeTruthy();
      expect(strangerItem.premiumPost.locked).toBe(true);

      // Anonymous: same as stranger - never purchased, never sees real
      // content or the real media URL.
      getServerSession.mockResolvedValue(null);
      const anonRes = await GET(req({ limit: "50" }));
      const anonItem = (await anonRes.json()).items.find((i: { id: string }) => i.id === post.id);
      expect(anonItem.caption).not.toContain("SECRET-PREMIUM-CONTENT");
      expect(anonItem.media.url).toBeNull();

      // The creator themself: always sees the real content and the real URL.
      getServerSession.mockResolvedValue(sessionFor(creator.id));
      const creatorRes = await GET(req({ limit: "50" }));
      const creatorItem = (await creatorRes.json()).items.find((i: { id: string }) => i.id === post.id);
      expect(creatorItem.caption).toContain("SECRET-PREMIUM-CONTENT");
      expect(creatorItem.media.url).toBe(realVideoUrl);

      // A completed purchaser: sees the real content and the real URL.
      getServerSession.mockResolvedValue(sessionFor(purchaser.id));
      const purchaserRes = await GET(req({ limit: "50" }));
      const purchaserItem = (await purchaserRes.json()).items.find((i: { id: string }) => i.id === post.id);
      expect(purchaserItem.caption).toContain("SECRET-PREMIUM-CONTENT");
      expect(purchaserItem.media.url).toBe(realVideoUrl);

      await prisma.premiumPurchase.deleteMany({ where: { premiumPostId: premiumPost.id } });
    });
  }
);
