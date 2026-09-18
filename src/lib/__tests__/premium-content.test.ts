import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { applyPremiumGating, withAuthorId, withoutAuthorId } from "../premium-content";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

/*
 * ⚠️ SECURITY regression coverage (N5 follow-up): applyPremiumGating()
 * used to only redact the TOP-LEVEL post passed to it - never a nested
 * `quotePost`. Every route that `include: { quotePost: {...} }` (post
 * detail, feed, explore, search, hashtag, profile/user post lists, the
 * quotes listing) returned a quote-post's full content/media in full
 * whenever that quote-post was itself premium-gated, regardless of
 * whether the viewer had purchased THAT quoted post specifically -
 * calling applyPremiumGating on the outer post never looked at it.
 */
describe.skipIf(!hasRealDatabaseUrl)(
  "applyPremiumGating - nested quotePost (integration, real Postgres)",
  () => {
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
          email: `${label}-${randomUUID().slice(0, 8)}@premiumcontenttest.example`,
          username: `${label}${randomUUID().slice(0, 8)}`.slice(0, 20),
          password: "x",
        },
      });
      userIds.push(user.id);
      return user;
    }

    async function createPremiumPost(authorId: string, price: number, content: string) {
      const post = await prisma.post.create({
        data: { authorId, content, status: "published" },
      });
      postIds.push(post.id);

      const creatorProfile = await prisma.creatorProfile.create({
        data: { userId: authorId, premiumPostsEnabled: true },
      });
      creatorProfileIds.push(creatorProfile.id);

      const premiumPost = await prisma.premiumPost.create({
        data: { postId: post.id, creatorProfileId: creatorProfile.id, price, previewContent: "unlock to read" },
      });

      return { post, premiumPost };
    }

    it("redacts a nested quotePost's content when it is premium and unpurchased, even though the outer post is not gated", async () => {
      const quotedAuthor = await createUser("quotedauthor1");
      const { post: quotedPost } = await createPremiumPost(quotedAuthor.id, 5, "SECRET quoted content");

      const quotingAuthor = await createUser("quotingauthor1");
      const quotingPost = await prisma.post.create({
        data: { authorId: quotingAuthor.id, content: "my thoughts on this", quotePostId: quotedPost.id, status: "published" },
      });
      postIds.push(quotingPost.id);

      const viewer = await createUser("viewer1");

      const [gated] = await applyPremiumGating(
        [{ id: quotingPost.id, authorId: quotingPost.authorId, content: quotingPost.content, quotePost: { id: quotedPost.id, authorId: quotedPost.authorId, content: quotedPost.content } }],
        viewer.id
      );

      // The outer (quoting) post is untouched - it isn't gated itself.
      expect(gated.content).toBe("my thoughts on this");
      // The nested quoted post's real content never reaches the response.
      expect(gated.quotePost?.content).not.toContain("SECRET quoted content");
      expect(gated.quotePost?.premiumPost?.locked).toBe(true);
    });

    it("unlocks a nested quotePost's content for a viewer who purchased THAT quoted post specifically", async () => {
      const quotedAuthor = await createUser("quotedauthor2");
      const { post: quotedPost, premiumPost } = await createPremiumPost(quotedAuthor.id, 5, "SECRET quoted content 2");

      const quotingAuthor = await createUser("quotingauthor2");
      const quotingPost = await prisma.post.create({
        data: { authorId: quotingAuthor.id, content: "commentary", quotePostId: quotedPost.id, status: "published" },
      });
      postIds.push(quotingPost.id);

      const buyer = await createUser("buyer2");
      await prisma.premiumPurchase.create({
        data: { premiumPostId: premiumPost.id, userId: buyer.id, amount: 5, status: "COMPLETED" },
      });

      const [gated] = await applyPremiumGating(
        [{ id: quotingPost.id, authorId: quotingPost.authorId, content: quotingPost.content, quotePost: { id: quotedPost.id, authorId: quotedPost.authorId, content: quotedPost.content } }],
        buyer.id
      );

      expect(gated.quotePost?.content).toBe("SECRET quoted content 2");
      expect(gated.quotePost?.premiumPost?.locked).toBe(false);
    });

    it("unlocks a nested quotePost for the quoted post's own author", async () => {
      const quotedAuthor = await createUser("quotedauthor3");
      const { post: quotedPost } = await createPremiumPost(quotedAuthor.id, 5, "SECRET quoted content 3");

      const quotingAuthor = await createUser("quotingauthor3");
      const quotingPost = await prisma.post.create({
        data: { authorId: quotingAuthor.id, content: "commentary 3", quotePostId: quotedPost.id, status: "published" },
      });
      postIds.push(quotingPost.id);

      const [gated] = await applyPremiumGating(
        [{ id: quotingPost.id, authorId: quotingPost.authorId, content: quotingPost.content, quotePost: { id: quotedPost.id, authorId: quotedPost.authorId, content: quotedPost.content } }],
        quotedAuthor.id
      );

      expect(gated.quotePost?.content).toBe("SECRET quoted content 3");
      expect(gated.quotePost?.premiumPost?.locked).toBe(false);
    });
  }
);

describe("withAuthorId / withoutAuthorId", () => {
  it("adds authorId from author.id (top level and nested quotePost), then removes it again without altering anything else", () => {
    const post = {
      id: "p1",
      content: "hello",
      author: { id: "u1", username: "alice" },
      quotePost: {
        id: "p2",
        content: "quoted",
        author: { id: "u2", username: "bob" },
        quotePost: null,
      },
    };

    const withIds = withAuthorId(post);
    expect(withIds.authorId).toBe("u1");
    expect(withIds.quotePost?.authorId).toBe("u2");

    const stripped = withoutAuthorId(withIds);
    expect(stripped).not.toHaveProperty("authorId");
    expect((stripped as any).quotePost).not.toHaveProperty("authorId");
    // Everything else survives the round trip unchanged.
    expect(stripped.content).toBe("hello");
    expect(stripped.author).toEqual({ id: "u1", username: "alice" });
    expect((stripped as any).quotePost.content).toBe("quoted");
  });

  it("handles a post with no quotePost at all", () => {
    const post = { id: "p1", content: "hello", author: { id: "u1" } };
    const withIds = withAuthorId(post);
    expect(withIds.authorId).toBe("u1");
    const stripped = withoutAuthorId(withIds);
    expect(stripped).not.toHaveProperty("authorId");
    expect(stripped).not.toHaveProperty("quotePost");
  });
});
