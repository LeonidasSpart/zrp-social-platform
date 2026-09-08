import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "../db";
import { getUserCharityContributionUsdc } from "../charity";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

// Regression coverage for replacing src/app/profile/[username]/page.tsx's
// `impactMeals = Math.floor(Math.random() * 50) + 5` - a number with no
// connection to anything real - with the sender's own actual charity
// contribution, computed the same way api/transparency/charity computes
// it platform-wide, just scoped to one person.
describe.skipIf(!hasRealDatabaseUrl)(
  "getUserCharityContributionUsdc (integration, real Postgres)",
  () => {
    const userIds: string[] = [];
    const creatorProfileIds: string[] = [];
    const tipIds: string[] = [];
    const postIds: string[] = [];
    const premiumPostIds: string[] = [];
    const purchaseIds: string[] = [];
    const runId = randomUUID().slice(0, 8);

    async function createUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${runId}@charitytest.example`,
          username: `${label}${runId}`.slice(0, 20),
          password: "x",
          role: "USER",
        },
      });
      userIds.push(user.id);
      return user;
    }

    afterAll(async () => {
      await prisma.tip.deleteMany({ where: { id: { in: tipIds } } });
      await prisma.premiumPurchase.deleteMany({ where: { id: { in: purchaseIds } } });
      await prisma.premiumPost.deleteMany({ where: { id: { in: premiumPostIds } } });
      await prisma.post.deleteMany({ where: { id: { in: postIds } } });
      await prisma.creatorProfile.deleteMany({ where: { id: { in: creatorProfileIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    it("returns 0 for a user with no tips or purchases at all", async () => {
      const user = await createUser("none");
      expect(await getUserCharityContributionUsdc(user.id)).toBe(0);
    });

    it("sums charityAmount across this user's own COMPLETED tips only", async () => {
      const sender = await createUser("sender");
      const recipient = await createUser("recipient");
      const creatorProfile = await prisma.creatorProfile.create({
        data: { id: randomUUID(), userId: recipient.id },
      });
      creatorProfileIds.push(creatorProfile.id);

      const completedTip = await prisma.tip.create({
        data: {
          id: randomUUID(),
          senderId: sender.id,
          recipientId: recipient.id,
          creatorProfileId: creatorProfile.id,
          amount: 10,
          charityAmount: 3.5,
          status: "COMPLETED",
        },
      });
      tipIds.push(completedTip.id);

      const pendingTip = await prisma.tip.create({
        data: {
          id: randomUUID(),
          senderId: sender.id,
          recipientId: recipient.id,
          creatorProfileId: creatorProfile.id,
          amount: 10,
          charityAmount: 99, // deliberately large - must NOT be counted
          status: "PENDING",
        },
      });
      tipIds.push(pendingTip.id);

      expect(await getUserCharityContributionUsdc(sender.id)).toBe(3.5);
      // The recipient's own contribution is unaffected by tips they received.
      expect(await getUserCharityContributionUsdc(recipient.id)).toBe(0);
    });

    it("sums charityAmount across this user's own COMPLETED premium-post purchases only", async () => {
      const buyer = await createUser("buyer");
      const creator = await createUser("creator2");
      const creatorProfile = await prisma.creatorProfile.create({
        data: { id: randomUUID(), userId: creator.id },
      });
      creatorProfileIds.push(creatorProfile.id);

      const post = await prisma.post.create({
        data: { id: randomUUID(), content: "premium content", authorId: creator.id, status: "published" },
      });
      postIds.push(post.id);
      // A second premium post so the failed purchase below isn't the same
      // buyer purchasing the same post twice - (premiumPostId, userId) is
      // unique.
      const post2 = await prisma.post.create({
        data: { id: randomUUID(), content: "premium content 2", authorId: creator.id, status: "published" },
      });
      postIds.push(post2.id);

      const premiumPost = await prisma.premiumPost.create({
        data: { id: randomUUID(), postId: post.id, creatorProfileId: creatorProfile.id, price: 5 },
      });
      premiumPostIds.push(premiumPost.id);
      const premiumPost2 = await prisma.premiumPost.create({
        data: { id: randomUUID(), postId: post2.id, creatorProfileId: creatorProfile.id, price: 5 },
      });
      premiumPostIds.push(premiumPost2.id);

      const completedPurchase = await prisma.premiumPurchase.create({
        data: {
          id: randomUUID(),
          premiumPostId: premiumPost.id,
          userId: buyer.id,
          amount: 5,
          charityAmount: 1.75,
          status: "COMPLETED",
        },
      });
      purchaseIds.push(completedPurchase.id);

      const failedPurchase = await prisma.premiumPurchase.create({
        data: {
          id: randomUUID(),
          premiumPostId: premiumPost2.id,
          userId: buyer.id,
          amount: 5,
          charityAmount: 42, // deliberately large - must NOT be counted
          status: "FAILED",
        },
      });
      purchaseIds.push(failedPurchase.id);

      expect(await getUserCharityContributionUsdc(buyer.id)).toBe(1.75);
    });

    it("adds tips and purchases together for a user who has both", async () => {
      const sender = await createUser("both");
      const recipient = await createUser("bothrecipient");
      const creatorProfile = await prisma.creatorProfile.create({
        data: { id: randomUUID(), userId: recipient.id },
      });
      creatorProfileIds.push(creatorProfile.id);

      const tip = await prisma.tip.create({
        data: {
          id: randomUUID(),
          senderId: sender.id,
          recipientId: recipient.id,
          creatorProfileId: creatorProfile.id,
          amount: 10,
          charityAmount: 2,
          status: "COMPLETED",
        },
      });
      tipIds.push(tip.id);

      const post = await prisma.post.create({
        data: { id: randomUUID(), content: "premium content 2", authorId: recipient.id, status: "published" },
      });
      postIds.push(post.id);
      const premiumPost = await prisma.premiumPost.create({
        data: { id: randomUUID(), postId: post.id, creatorProfileId: creatorProfile.id, price: 5 },
      });
      premiumPostIds.push(premiumPost.id);
      const purchase = await prisma.premiumPurchase.create({
        data: {
          id: randomUUID(),
          premiumPostId: premiumPost.id,
          userId: sender.id,
          amount: 5,
          charityAmount: 1.25,
          status: "COMPLETED",
        },
      });
      purchaseIds.push(purchase.id);

      expect(await getUserCharityContributionUsdc(sender.id)).toBe(3.25);
    });
  }
);
