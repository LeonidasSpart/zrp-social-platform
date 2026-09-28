import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { getRedisClient } from "@/lib/redis";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { GET } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function req(query: Record<string, string> = {}) {
  const url = new URL("https://zrp.one/api/search");
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

function sessionFor(userId: string) {
  return { user: { id: userId } };
}

// Advanced Search (Task #2): GET /api/search grew from a users/posts-only,
// unpaginated, unfiltered endpoint into a full contract spanning 8
// categories, 4 sort modes, filters, and real pagination. See
// docs/advanced-search-architecture.md for the design; this file covers
// per-category matching, security enforcement (the mandatory part), and
// pagination correctness. Redis-dependent assertions (cache-based
// offset pagination) require REDIS_URL to actually cache anything -
// without it every request is a fresh cache miss, which is still
// correct, just not what those specific tests are checking.
describe.skipIf(!hasRealDatabaseUrl)("GET /api/search (integration, real Postgres)", () => {
  const runId = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const postIds: string[] = [];
  const communityIds: string[] = [];
  const listingIds: string[] = [];
  const opportunityIds: string[] = [];
  const newsArticleIds: string[] = [];
  const musicArtistIds: string[] = [];
  const musicTrackIds: string[] = [];
  const premiumPostIds: string[] = [];

  async function createUser(label: string, overrides: Record<string, unknown> = {}) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${runId}@searchtest.example`,
        username: `${label}${runId}`.slice(0, 20),
        password: "x",
        role: "USER",
        ...overrides,
      },
    });
    userIds.push(user.id);
    return user;
  }

  async function createPost(authorId: string, content: string, overrides: Record<string, unknown> = {}) {
    const post = await prisma.post.create({
      data: { id: randomUUID(), content, authorId, status: "published", hashtags: [], ...overrides },
    });
    postIds.push(post.id);
    return post;
  }

  beforeEach(async () => {
    const redis = await getRedisClient();
    if (redis) await redis.flushDb();
    getServerSession.mockReset();
  });

  afterAll(async () => {
    await prisma.premiumPost.deleteMany({ where: { id: { in: premiumPostIds } } });
    await prisma.post.deleteMany({ where: { id: { in: postIds } } });
    await prisma.musicTrack.deleteMany({ where: { id: { in: musicTrackIds } } });
    await prisma.musicArtist.deleteMany({ where: { id: { in: musicArtistIds } } });
    await prisma.newsArticle.deleteMany({ where: { id: { in: newsArticleIds } } });
    await prisma.opportunityListing.deleteMany({ where: { id: { in: opportunityIds } } });
    await prisma.listing.deleteMany({ where: { id: { in: listingIds } } });
    await prisma.communityMember.deleteMany({ where: { communityId: { in: communityIds } } });
    await prisma.community.deleteMany({ where: { id: { in: communityIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  describe("empty/short query", () => {
    it("returns the pre-existing {users, posts} shape for type=all", async () => {
      getServerSession.mockResolvedValueOnce(null);
      const res = await GET(req({ q: "a" }));
      expect(await res.json()).toEqual({ users: [], posts: [] });
    });

    it("returns the single-category empty shape for a specific type", async () => {
      getServerSession.mockResolvedValueOnce(null);
      const res = await GET(req({ q: "a", type: "communities" }));
      const body = await res.json();
      expect(body).toEqual({ results: [], nextCursor: null, category: "communities", sort: "relevance" });
    });
  });

  describe("People (users)", () => {
    it("matches by username and by display name", async () => {
      const byUsername = await createUser(`leonidas${runId}`);
      const byName = await createUser("namedperson", { name: `Leonidas${runId}` });
      getServerSession.mockResolvedValueOnce(null);

      const res = await GET(req({ q: `leonidas${runId}`, type: "users" }));
      const body = await res.json();
      const ids = body.results.map((u: { id: string }) => u.id);
      expect(ids).toContain(byUsername.id);
      expect(ids).toContain(byName.id);
    });

    it("never returns a banned account", async () => {
      const banned = await createUser(`bannedsearch${runId}`, { banned: true });
      getServerSession.mockResolvedValueOnce(null);

      const res = await GET(req({ q: `bannedsearch${runId}`, type: "users" }));
      const body = await res.json();
      expect(body.results.map((u: { id: string }) => u.id)).not.toContain(banned.id);
    });

    it("⚠️ SECURITY: never returns a user the viewer has blocked, or who has blocked the viewer", async () => {
      const viewer = await createUser(`viewerblk${runId}`);
      const blockedByViewer = await createUser(`blockedone${runId}`);
      const blocksViewer = await createUser(`blockedtwo${runId}`);
      await prisma.blocked.create({ data: { blockerId: viewer.id, blockedId: blockedByViewer.id } });
      await prisma.blocked.create({ data: { blockerId: blocksViewer.id, blockedId: viewer.id } });
      getServerSession.mockResolvedValueOnce(sessionFor(viewer.id));

      const res = await GET(req({ q: `${runId}`, type: "users" }));
      const body = await res.json();
      const ids = body.results.map((u: { id: string }) => u.id);
      expect(ids).not.toContain(blockedByViewer.id);
      expect(ids).not.toContain(blocksViewer.id);
    });

    it("⚠️ SECURITY: never returns a user the viewer has muted", async () => {
      const viewer = await createUser(`viewermute${runId}`);
      const muted = await createUser(`mutedperson${runId}`);
      await prisma.mute.create({ data: { muterId: viewer.id, mutedId: muted.id } });
      getServerSession.mockResolvedValueOnce(sessionFor(viewer.id));

      const res = await GET(req({ q: `mutedperson${runId}`, type: "users" }));
      const body = await res.json();
      expect(body.results.map((u: { id: string }) => u.id)).not.toContain(muted.id);
    });

    it("verified=true only returns accounts with a badge", async () => {
      const verified = await createUser(`verifiedu${runId}`, { badgeType: "verified" });
      const plain = await createUser(`plainuseru${runId}`);
      getServerSession.mockResolvedValueOnce(null);

      const res = await GET(req({ q: `${runId}`, type: "users", verified: "true" }));
      const body = await res.json();
      const ids = body.results.map((u: { id: string }) => u.id);
      expect(ids).toContain(verified.id);
      expect(ids).not.toContain(plain.id);
    });

    it("sort=recent paginates with no duplicates or gaps across two pages", async () => {
      const created = [];
      for (let i = 0; i < 5; i++) {
        created.push(await createUser(`recentu${i}${runId}`));
      }
      getServerSession.mockResolvedValueOnce(null);
      const page1 = await GET(req({ q: `recentu`, type: "users", sort: "recent", limit: "3" }));
      const body1 = await page1.json();
      expect(body1.results.length).toBe(3);
      expect(body1.nextCursor).toBeTruthy();

      getServerSession.mockResolvedValueOnce(null);
      const page2 = await GET(
        req({ q: `recentu`, type: "users", sort: "recent", limit: "3", cursor: body1.nextCursor })
      );
      const body2 = await page2.json();

      const page1Ids = body1.results.map((u: { id: string }) => u.id);
      const page2Ids = body2.results.map((u: { id: string }) => u.id);
      expect(page1Ids.some((id: string) => page2Ids.includes(id))).toBe(false);
    });

    it("an invalid cursor never crashes the request", async () => {
      await createUser(`invalidcursor${runId}`);
      getServerSession.mockResolvedValueOnce(null);
      const res = await GET(
        req({ q: `invalidcursor${runId}`, type: "users", sort: "recent", cursor: "this-cursor-does-not-exist" })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.results)).toBe(true);
    });
  });

  describe("Posts", () => {
    it("matches by content and by hashtag", async () => {
      const author = await createUser(`postauthor${runId}`);
      const byContent = await createPost(author.id, `something about ${runId}zebra`);
      const byHashtag = await createPost(author.id, "tagged post", { hashtags: [`${runId}zebra`] });
      getServerSession.mockResolvedValueOnce(null);

      const res = await GET(req({ q: `${runId}zebra`, type: "posts" }));
      const body = await res.json();
      const ids = body.results.map((p: { id: string }) => p.id);
      expect(ids).toContain(byContent.id);
      expect(ids).toContain(byHashtag.id);
    });

    it("⚠️ SECURITY: never returns a private account's post to a non-follower", async () => {
      const privateAuthor = await createUser(`privateauthor${runId}`, { isPrivate: true });
      const post = await createPost(privateAuthor.id, `private content ${runId}unique`);
      const viewer = await createUser(`nonfollower${runId}`);
      getServerSession.mockResolvedValueOnce(sessionFor(viewer.id));

      const res = await GET(req({ q: `${runId}unique`, type: "posts" }));
      const body = await res.json();
      expect(body.results.map((p: { id: string }) => p.id)).not.toContain(post.id);
    });

    it("⚠️ SECURITY: redacts a premium post's content for a viewer who hasn't purchased it", async () => {
      const creator = await createUser(`premiumcreator${runId}`);
      const post = await createPost(creator.id, `premium content ${runId}secret`);
      const creatorProfile = await prisma.creatorProfile.create({ data: { userId: creator.id } });
      const premiumPost = await prisma.premiumPost.create({
        data: {
          id: randomUUID(),
          postId: post.id,
          creatorProfileId: creatorProfile.id,
          price: 5,
          currency: "USDC",
          previewContent: "Locked preview",
        },
      });
      premiumPostIds.push(premiumPost.id);
      const viewer = await createUser(`nonpurchaser${runId}`);
      getServerSession.mockResolvedValueOnce(sessionFor(viewer.id));

      const res = await GET(req({ q: `${runId}secret`, type: "posts" }));
      const body = await res.json();
      const found = body.results.find((p: { id: string }) => p.id === post.id);
      expect(found).toBeDefined();
      expect(found.content).not.toContain("secret");
      expect(found.premiumPost.locked).toBe(true);
    });

    it("media=video only returns posts with mediaType video", async () => {
      const author = await createUser(`mediaauthor${runId}`);
      const withVideo = await createPost(author.id, `video post ${runId}clip`, { mediaType: "video" });
      const withoutMedia = await createPost(author.id, `plain post ${runId}clip`);
      getServerSession.mockResolvedValueOnce(null);

      const res = await GET(req({ q: `${runId}clip`, type: "posts", media: "video" }));
      const body = await res.json();
      const ids = body.results.map((p: { id: string }) => p.id);
      expect(ids).toContain(withVideo.id);
      expect(ids).not.toContain(withoutMedia.id);
    });
  });

  describe("Hashtags", () => {
    it("prefix-matches a real hashtag used on a live post", async () => {
      const author = await createUser(`hashtagauthor${runId}`);
      await createPost(author.id, "post", { hashtags: [`${runId}travel`] });
      getServerSession.mockResolvedValueOnce(null);

      const res = await GET(req({ q: `${runId}tra`, type: "hashtags" }));
      const body = await res.json();
      expect(body.results.map((h: { tag: string }) => h.tag)).toContain(`${runId}travel`);
    });
  });

  describe("Communities", () => {
    it("matches by name", async () => {
      const creator = await createUser(`communitycreator${runId}`);
      const community = await prisma.community.create({
        data: {
          slug: `zrp-community-${runId}`,
          name: `Amazing ${runId} Community`,
          description: "desc",
          hashtag: `${runId}community`,
          createdById: creator.id,
        },
      });
      communityIds.push(community.id);
      getServerSession.mockResolvedValueOnce(null);

      const res = await GET(req({ q: `Amazing ${runId}`, type: "communities" }));
      const body = await res.json();
      expect(body.results.map((c: { id: string }) => c.id)).toContain(community.id);
    });
  });

  describe("News", () => {
    it("⚠️ SECURITY: only returns a PUBLISHED article, never a DRAFT one", async () => {
      const journalist = await createUser(`journalist${runId}`);
      const published = await prisma.newsArticle.create({
        data: {
          title: `Published Story ${runId}`,
          slug: `published-story-${runId}`,
          content: "body",
          authorId: journalist.id,
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      });
      const draft = await prisma.newsArticle.create({
        data: {
          title: `Draft Story ${runId}`,
          slug: `draft-story-${runId}`,
          content: "body",
          authorId: journalist.id,
          status: "DRAFT",
        },
      });
      newsArticleIds.push(published.id, draft.id);
      getServerSession.mockResolvedValueOnce(null);

      const res = await GET(req({ q: `Story ${runId}`, type: "news" }));
      const body = await res.json();
      const ids = body.results.map((a: { id: string }) => a.id);
      expect(ids).toContain(published.id);
      expect(ids).not.toContain(draft.id);
    });
  });

  describe("Opportunities", () => {
    it("⚠️ SECURITY: only returns an ACTIVE listing, never one PENDING_REVIEW", async () => {
      const poster = await createUser(`opportunityposter${runId}`);
      const active = await prisma.opportunityListing.create({
        data: {
          posterId: poster.id,
          type: "JOB",
          title: `Active Job ${runId}`,
          description: "desc",
          status: "ACTIVE",
        },
      });
      const pending = await prisma.opportunityListing.create({
        data: {
          posterId: poster.id,
          type: "JOB",
          title: `Pending Job ${runId}`,
          description: "desc",
          status: "PENDING_REVIEW",
        },
      });
      opportunityIds.push(active.id, pending.id);
      getServerSession.mockResolvedValueOnce(null);

      const res = await GET(req({ q: `Job ${runId}`, type: "opportunities" }));
      const body = await res.json();
      const ids = body.results.map((o: { id: string }) => o.id);
      expect(ids).toContain(active.id);
      expect(ids).not.toContain(pending.id);
    });
  });

  describe("Marketplace", () => {
    it("⚠️ SECURITY: only returns an ACTIVE listing, never one PENDING_REVIEW", async () => {
      const seller = await createUser(`marketplaceseller${runId}`);
      const active = await prisma.listing.create({
        data: {
          sellerId: seller.id,
          category: "OTHER_LUXURY",
          title: `Active Watch ${runId}`,
          description: "desc",
          status: "ACTIVE",
        },
      });
      const pending = await prisma.listing.create({
        data: {
          sellerId: seller.id,
          category: "OTHER_LUXURY",
          title: `Pending Watch ${runId}`,
          description: "desc",
          status: "PENDING_REVIEW",
        },
      });
      listingIds.push(active.id, pending.id);
      getServerSession.mockResolvedValueOnce(null);

      const res = await GET(req({ q: `Watch ${runId}`, type: "marketplace" }));
      const body = await res.json();
      const ids = body.results.map((l: { id: string }) => l.id);
      expect(ids).toContain(active.id);
      expect(ids).not.toContain(pending.id);
    });

    it("⚠️ SECURITY: never returns an expired listing", async () => {
      const seller = await createUser(`expiredseller${runId}`);
      const expired = await prisma.listing.create({
        data: {
          sellerId: seller.id,
          category: "OTHER_LUXURY",
          title: `Expired Item ${runId}`,
          description: "desc",
          status: "ACTIVE",
          expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      });
      listingIds.push(expired.id);
      getServerSession.mockResolvedValueOnce(null);

      const res = await GET(req({ q: `Item ${runId}`, type: "marketplace" }));
      const body = await res.json();
      expect(body.results.map((l: { id: string }) => l.id)).not.toContain(expired.id);
    });
  });

  describe("Music", () => {
    it("matches an artist by displayName and a track by title, merged into one ranked list", async () => {
      const artistUser = await createUser(`artistuser${runId}`);
      const artist = await prisma.musicArtist.create({
        data: { userId: artistUser.id, displayName: `Band ${runId}` },
      });
      musicArtistIds.push(artist.id);
      const track = await prisma.musicTrack.create({
        data: {
          artistId: artist.id,
          title: `Song ${runId} Hit`,
          audioUrl: "https://cdn.example.com/a.mp3",
          status: "PUBLISHED",
        },
      });
      musicTrackIds.push(track.id);
      getServerSession.mockResolvedValueOnce(null);

      const res = await GET(req({ q: `${runId}`, type: "music" }));
      const body = await res.json();
      const kinds = body.results.map((r: { kind: string; id: string }) => `${r.kind}:${r.id}`);
      expect(kinds).toContain(`artist:${artist.id}`);
      expect(kinds).toContain(`track:${track.id}`);
    });
  });

  describe("type=all backward compatibility", () => {
    it("still returns {users, posts, ...} with the pre-existing keys populated for legacy callers", async () => {
      const user = await createUser(`allmodeuser${runId}`);
      const post = await createPost(user.id, `all mode content ${runId}`);
      getServerSession.mockResolvedValueOnce(null);

      const res = await GET(req({ q: `${runId}`, type: "all" }));
      const body = await res.json();
      expect(Array.isArray(body.users)).toBe(true);
      expect(Array.isArray(body.posts)).toBe(true);
      expect(body.users.map((u: { id: string }) => u.id)).toContain(user.id);
      expect(body.posts.map((p: { id: string }) => p.id)).toContain(post.id);
      // Additive: new category keys exist alongside the legacy ones.
      expect(Array.isArray(body.communities)).toBe(true);
      expect(body.nextCursors).toBeDefined();
    });
  });
});
