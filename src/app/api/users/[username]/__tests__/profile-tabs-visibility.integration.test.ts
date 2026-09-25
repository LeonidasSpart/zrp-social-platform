import { describe, it, expect, vi, afterAll, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { GET as getReposts } from "../reposts/route";
import { GET as getLikes } from "../likes/route";
import { GET as getMedia } from "../media/route";
import { GET as getReplies } from "../replies/route";
import { GET as getFollowers } from "../followers/route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

type Handler = (
  req: NextRequest,
  props: { params: Promise<{ username: string }> }
) => Promise<Response>;

async function call(handler: Handler, username: string) {
  const res = await handler(new NextRequest(`https://zrp.one/api/users/${username}/x`), {
    params: Promise.resolve({ username }),
  });
  return { status: res.status, body: await res.json() };
}

/*
 * ⚠️ SECURITY regression coverage for the profile tabs:
 *  - reposts/likes/media/replies returned pay-per-view post content and
 *    media unredacted (applyPremiumGating was only wired into /posts);
 *  - reposts/likes/replies surfaced posts by a PRIVATE account the
 *    viewer does not follow, via someone else's profile tab;
 *  - followers ignored blocks (blocking doesn't delete a Follow row).
 */
describe.skipIf(!hasRealDatabaseUrl)(
  "profile tabs - premium gating, private-author and block visibility (integration)",
  () => {
    const suffix = randomUUID().slice(0, 6);
    const userIds: string[] = [];
    const postIds: string[] = [];

    let owner: { id: string; username: string }; // the profile being viewed
    let creator: { id: string; username: string }; // author of a premium post
    let privateAuthor: { id: string; username: string };
    let viewer: { id: string; username: string };

    const SECRET = `premium-secret-${suffix}`;
    const PRIVATE_TEXT = `private-only-${suffix}`;

    async function createUser(label: string, extra: Record<string, unknown> = {}) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${suffix}@tabstest.example`,
          username: `${label}${suffix}`.slice(0, 20),
          password: "x",
          ...extra,
        },
      });
      userIds.push(user.id);
      return user;
    }

    beforeAll(async () => {
      owner = await createUser("owner");
      creator = await createUser("creator");
      privateAuthor = await createUser("priv", { isPrivate: true });
      viewer = await createUser("viewer");

      // Premium post by `creator`, liked + reposted + replied to by owner.
      const premium = await prisma.post.create({
        data: {
          authorId: creator.id,
          content: SECRET,
          imageUrl: "https://utfs.io/f/secret.png",
          imageUrls: ["https://utfs.io/f/secret.png"],
          status: "published",
        },
      });
      postIds.push(premium.id);
      const creatorProfile = await prisma.creatorProfile.create({
        data: { userId: creator.id, premiumPostsEnabled: true },
      });
      await prisma.premiumPost.create({
        data: { postId: premium.id, creatorProfileId: creatorProfile.id, price: 5, previewContent: "preview" },
      });

      // Owner's own premium media post (Media tab).
      const ownerPremium = await prisma.post.create({
        data: {
          authorId: owner.id,
          content: SECRET,
          imageUrl: "https://utfs.io/f/owner-secret.png",
          imageUrls: ["https://utfs.io/f/owner-secret.png"],
          status: "published",
        },
      });
      postIds.push(ownerPremium.id);
      const ownerProfile = await prisma.creatorProfile.create({
        data: { userId: owner.id, premiumPostsEnabled: true },
      });
      await prisma.premiumPost.create({
        data: { postId: ownerPremium.id, creatorProfileId: ownerProfile.id, price: 5, previewContent: "preview" },
      });

      // A private account's post the owner follows and interacts with.
      await prisma.follow.create({ data: { followerId: owner.id, followingId: privateAuthor.id } });
      const privatePost = await prisma.post.create({
        data: { authorId: privateAuthor.id, content: PRIVATE_TEXT, status: "published" },
      });
      postIds.push(privatePost.id);

      await prisma.user.update({ where: { id: owner.id }, data: { publicLikes: true } });
      for (const postId of [premium.id, privatePost.id]) {
        await prisma.like.create({ data: { userId: owner.id, postId } });
        await prisma.repost.create({ data: { userId: owner.id, postId } });
        await prisma.comment.create({ data: { authorId: owner.id, postId, content: `reply-${suffix}` } });
      }
    });

    afterAll(async () => {
      await prisma.comment.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.like.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.repost.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.premiumPost.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.post.deleteMany({ where: { id: { in: postIds } } });
      await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.blocked.deleteMany({ where: { blockerId: { in: userIds } } });
      await prisma.follow.deleteMany({ where: { followerId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    it("reposts tab: redacts premium content and hides a private author's post from a non-follower", async () => {
      getServerSession.mockResolvedValue({ user: { id: viewer.id } });
      const { status, body } = await call(getReposts as Handler, owner.username);
      expect(status).toBe(200);
      const raw = JSON.stringify(body);
      expect(raw).not.toContain(SECRET);
      expect(raw).not.toContain("secret.png");
      expect(raw).not.toContain(PRIVATE_TEXT);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].premiumPost.locked).toBe(true);
    });

    it("likes tab: same redaction and private-author filter", async () => {
      getServerSession.mockResolvedValue(null);
      const { body } = await call(getLikes as Handler, owner.username);
      const raw = JSON.stringify(body);
      expect(raw).not.toContain(SECRET);
      expect(raw).not.toContain(PRIVATE_TEXT);
      expect(body.items).toHaveLength(1);
    });

    it("media tab: redacts the owner's own premium images for other viewers", async () => {
      getServerSession.mockResolvedValue({ user: { id: viewer.id } });
      const { body } = await call(getMedia as Handler, owner.username);
      const raw = JSON.stringify(body);
      expect(raw).not.toContain(SECRET);
      expect(raw).not.toContain("owner-secret.png");
    });

    it("media tab: the owner still sees their own premium media", async () => {
      getServerSession.mockResolvedValue({ user: { id: owner.id } });
      const { body } = await call(getMedia as Handler, owner.username);
      expect(JSON.stringify(body)).toContain("owner-secret.png");
    });

    it("replies tab: parent context is redacted/filtered the same way", async () => {
      getServerSession.mockResolvedValue({ user: { id: viewer.id } });
      const { body } = await call(getReplies as Handler, owner.username);
      const raw = JSON.stringify(body);
      expect(raw).not.toContain(SECRET);
      expect(raw).not.toContain(PRIVATE_TEXT);
      expect(body.items).toHaveLength(1);
    });

    it("a follower of the private author still sees its post in the tabs", async () => {
      await prisma.follow.create({ data: { followerId: viewer.id, followingId: privateAuthor.id } });
      try {
        getServerSession.mockResolvedValue({ user: { id: viewer.id } });
        const { body } = await call(getReposts as Handler, owner.username);
        expect(JSON.stringify(body)).toContain(PRIVATE_TEXT);
      } finally {
        await prisma.follow.deleteMany({ where: { followerId: viewer.id, followingId: privateAuthor.id } });
      }
    });

    it("followers list is empty for a viewer the profile owner has blocked", async () => {
      await prisma.follow.create({ data: { followerId: viewer.id, followingId: owner.id } });
      getServerSession.mockResolvedValue({ user: { id: viewer.id } });
      const before = await call(getFollowers as Handler, owner.username);
      expect(before.body.items.length).toBeGreaterThan(0);

      await prisma.blocked.create({ data: { blockerId: owner.id, blockedId: viewer.id } });
      const after = await call(getFollowers as Handler, owner.username);
      expect(after.body.items).toEqual([]);
    });
  }
);
