import { describe, it, expect, vi, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { GET } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function videosReq(qs = "") {
  return new NextRequest(`https://zrp.one/api/videos${qs}`);
}

/*
 * ⚠️ SECURITY regression coverage: GET /api/videos selected and returned
 * `imageUrl` (the real, playable video URL) for every post regardless of
 * PremiumPost/PremiumPurchase status - a pay-per-view Short was fully
 * playable by anyone, including an anonymous visitor, simply by opening
 * Shorts, completely bypassing the on-chain purchase flow even though
 * that flow itself was real and independently verified. Fixed by running
 * every result through the same applyPremiumGating() helper every other
 * post-listing route already uses (src/lib/premium-content.ts).
 */
describe.skipIf(!hasRealDatabaseUrl)(
  "GET /api/videos - premium/pay-per-view gating (integration, real Postgres)",
  () => {
    const suffix = randomUUID().slice(0, 8);
    const userIds: string[] = [];
    const postIds: string[] = [];
    const creatorProfileIds: string[] = [];

    afterAll(async () => {
      await prisma.premiumPurchase.deleteMany({ where: { premiumPost: { postId: { in: postIds } } } });
      await prisma.premiumPost.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.post.deleteMany({ where: { id: { in: postIds } } });
      await prisma.creatorProfile.deleteMany({ where: { id: { in: creatorProfileIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    async function createUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${suffix}@premiumvideotest.example`,
          username: `${label}${suffix}`.slice(0, 20),
          password: "x",
        },
      });
      userIds.push(user.id);
      return user;
    }

    async function createPremiumVideoPost(authorId: string, price: number) {
      const post = await prisma.post.create({
        data: {
          authorId,
          content: "real caption - never sent unlocked",
          imageUrl: "https://utfs.io/f/real-premium-video-url.mp4",
          mediaType: "video",
          status: "published",
        },
      });
      postIds.push(post.id);

      const creatorProfile = await prisma.creatorProfile.create({
        data: { userId: authorId, premiumPostsEnabled: true },
      });
      creatorProfileIds.push(creatorProfile.id);

      const premiumPost = await prisma.premiumPost.create({
        data: {
          postId: post.id,
          creatorProfileId: creatorProfile.id,
          price,
          previewContent: "unlock this Short to watch",
        },
      });

      return { post, premiumPost };
    }

    it("never returns the real video URL to an anonymous viewer", async () => {
      const creator = await createUser("creator1");
      const { post } = await createPremiumVideoPost(creator.id, 5);

      getServerSession.mockResolvedValue(null);
      const res = await GET(videosReq(`?startId=${post.id}&limit=5`));
      expect(res.status).toBe(200);
      const body = await res.json();
      const found = body.posts.find((p: { id: string }) => p.id === post.id);

      expect(found).toBeDefined();
      expect(found.imageUrl).toBeNull();
      expect(found.premiumPost).toBeDefined();
      expect(found.premiumPost.locked).toBe(true);
      expect(found.premiumPost.price).toBe(5);
    });

    it("never returns the real video URL to a signed-in viewer who hasn't purchased it", async () => {
      const creator = await createUser("creator2");
      const viewer = await createUser("viewer2");
      const { post } = await createPremiumVideoPost(creator.id, 3);

      getServerSession.mockResolvedValue({ user: { id: viewer.id } });
      const res = await GET(videosReq(`?startId=${post.id}&limit=5`));
      const body = await res.json();
      const found = body.posts.find((p: { id: string }) => p.id === post.id);

      expect(found.imageUrl).toBeNull();
      expect(found.premiumPost.locked).toBe(true);
    });

    it("returns the real video URL to the creator who authored it", async () => {
      const creator = await createUser("creator3");
      const { post } = await createPremiumVideoPost(creator.id, 7);

      getServerSession.mockResolvedValue({ user: { id: creator.id } });
      const res = await GET(videosReq(`?startId=${post.id}&limit=5`));
      const body = await res.json();
      const found = body.posts.find((p: { id: string }) => p.id === post.id);

      expect(found.imageUrl).toBe("https://utfs.io/f/real-premium-video-url.mp4");
      expect(found.premiumPost.locked).toBe(false);
    });

    it("returns the real video URL to a viewer with a COMPLETED purchase", async () => {
      const creator = await createUser("creator4");
      const buyer = await createUser("buyer4");
      const { post, premiumPost } = await createPremiumVideoPost(creator.id, 2);

      await prisma.premiumPurchase.create({
        data: {
          premiumPostId: premiumPost.id,
          userId: buyer.id,
          amount: 2,
          status: "COMPLETED",
        },
      });

      getServerSession.mockResolvedValue({ user: { id: buyer.id } });
      const res = await GET(videosReq(`?startId=${post.id}&limit=5`));
      const body = await res.json();
      const found = body.posts.find((p: { id: string }) => p.id === post.id);

      expect(found.imageUrl).toBe("https://utfs.io/f/real-premium-video-url.mp4");
      expect(found.premiumPost.locked).toBe(false);
    });

    it("still redacts the URL for a viewer with only a PENDING (unverified) purchase", async () => {
      const creator = await createUser("creator5");
      const buyer = await createUser("buyer5");
      const { post, premiumPost } = await createPremiumVideoPost(creator.id, 4);

      await prisma.premiumPurchase.create({
        data: {
          premiumPostId: premiumPost.id,
          userId: buyer.id,
          amount: 4,
          status: "PENDING",
        },
      });

      getServerSession.mockResolvedValue({ user: { id: buyer.id } });
      const res = await GET(videosReq(`?startId=${post.id}&limit=5`));
      const body = await res.json();
      const found = body.posts.find((p: { id: string }) => p.id === post.id);

      expect(found.imageUrl).toBeNull();
      expect(found.premiumPost.locked).toBe(true);
    });

    it("also gates a locked video reached through the normal paginated feed (not just ?startId)", async () => {
      const creator = await createUser("creator6");
      const { post } = await createPremiumVideoPost(creator.id, 6);

      getServerSession.mockResolvedValue(null);
      const res = await GET(videosReq("?limit=30"));
      const body = await res.json();
      const found = body.posts.find((p: { id: string }) => p.id === post.id);

      expect(found).toBeDefined();
      expect(found.imageUrl).toBeNull();
      expect(found.premiumPost.locked).toBe(true);
    });
  }
);
