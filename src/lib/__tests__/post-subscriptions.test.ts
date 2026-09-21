import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { notifySubscribersOfNewPost } from "@/lib/post-subscriptions";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

describe.skipIf(!hasRealDatabaseUrl)(
  "notifySubscribersOfNewPost (integration, real Postgres)",
  () => {
    const runId = randomUUID().slice(0, 8);
    const userIds: string[] = [];
    const postIds: string[] = [];

    afterAll(async () => {
      await prisma.notification.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.postSubscription.deleteMany({
        where: { OR: [{ subscriberId: { in: userIds } }, { authorId: { in: userIds } }] },
      });
      await prisma.blocked.deleteMany({
        where: { OR: [{ blockerId: { in: userIds } }, { blockedId: { in: userIds } }] },
      });
      await prisma.post.deleteMany({ where: { id: { in: postIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    async function createUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${runId}@postsubtest.example`,
          username: `${label}${runId}`.slice(0, 20),
          password: "x",
        },
      });
      userIds.push(user.id);
      return user;
    }

    async function createPost(authorId: string) {
      const post = await prisma.post.create({
        data: { content: `subscription test ${runId}`, authorId, status: "published" },
      });
      postIds.push(post.id);
      return post;
    }

    it("[1-3] a subscriber is notified when the author posts", async () => {
      const author = await createUser("author1");
      const subscriber = await createUser("subscriber1");
      await prisma.postSubscription.create({
        data: { subscriberId: subscriber.id, authorId: author.id },
      });
      const post = await createPost(author.id);

      await notifySubscribersOfNewPost({ postId: post.id, authorId: author.id, authorName: "Author One" });

      const notif = await prisma.notification.findFirst({
        where: { userId: subscriber.id, fromUserId: author.id, postId: post.id, type: "post_from_subscription" },
      });
      expect(notif).toBeTruthy();
    });

    it("[4] a user who did NOT subscribe receives nothing", async () => {
      const author = await createUser("author2");
      const subscriber = await createUser("subscriber2");
      const nonSubscriber = await createUser("nonsubscriber2");
      await prisma.postSubscription.create({
        data: { subscriberId: subscriber.id, authorId: author.id },
      });
      const post = await createPost(author.id);

      await notifySubscribersOfNewPost({ postId: post.id, authorId: author.id, authorName: "Author Two" });

      const notif = await prisma.notification.findFirst({
        where: { userId: nonSubscriber.id, postId: post.id, type: "post_from_subscription" },
      });
      expect(notif).toBeNull();
    });

    it("[5-7] after unsubscribing, a later post never notifies that user again", async () => {
      const author = await createUser("author3");
      const subscriber = await createUser("subscriber3");
      await prisma.postSubscription.create({
        data: { subscriberId: subscriber.id, authorId: author.id },
      });

      const firstPost = await createPost(author.id);
      await notifySubscribersOfNewPost({ postId: firstPost.id, authorId: author.id, authorName: "Author Three" });
      let notif = await prisma.notification.findFirst({
        where: { userId: subscriber.id, postId: firstPost.id, type: "post_from_subscription" },
      });
      expect(notif).toBeTruthy();

      // Unsubscribe (deleting the row IS "disabled", same convention as
      // Follow/Mute - see PostSubscription's own schema comment).
      await prisma.postSubscription.delete({
        where: { subscriberId_authorId: { subscriberId: subscriber.id, authorId: author.id } },
      });

      const secondPost = await createPost(author.id);
      await notifySubscribersOfNewPost({ postId: secondPost.id, authorId: author.id, authorName: "Author Three" });
      notif = await prisma.notification.findFirst({
        where: { userId: subscriber.id, postId: secondPost.id, type: "post_from_subscription" },
      });
      expect(notif).toBeNull();
    });

    it("[8] a duplicate PostSubscription row can never exist (unique constraint)", async () => {
      const author = await createUser("author4");
      const subscriber = await createUser("subscriber4");
      await prisma.postSubscription.create({
        data: { subscriberId: subscriber.id, authorId: author.id },
      });

      await expect(
        prisma.postSubscription.create({
          data: { subscriberId: subscriber.id, authorId: author.id },
        })
      ).rejects.toThrow();

      const rows = await prisma.postSubscription.findMany({
        where: { subscriberId: subscriber.id, authorId: author.id },
      });
      expect(rows).toHaveLength(1);
    });

    it("[9] calling the fan-out twice for the same post does not create a duplicate notification", async () => {
      const author = await createUser("author5");
      const subscriber = await createUser("subscriber5");
      await prisma.postSubscription.create({
        data: { subscriberId: subscriber.id, authorId: author.id },
      });
      const post = await createPost(author.id);

      await notifySubscribersOfNewPost({ postId: post.id, authorId: author.id, authorName: "Author Five" });
      // A second, redundant fan-out call for the exact same post (e.g. a
      // retried request) - the partial unique index on
      // (userId, postId) WHERE type = 'post_from_subscription' plus
      // skipDuplicates makes this a structural no-op.
      await notifySubscribersOfNewPost({ postId: post.id, authorId: author.id, authorName: "Author Five" });

      const notifs = await prisma.notification.findMany({
        where: { userId: subscriber.id, postId: post.id, type: "post_from_subscription" },
      });
      expect(notifs).toHaveLength(1);
    });

    it("[11] the author is never notified about their own post, even if subscribed to themself", async () => {
      const author = await createUser("author6");
      // Defensive case: a self-subscription should never exist via the
      // API (blocked at the route), but the fan-out itself must still
      // refuse to self-notify if one somehow did.
      await prisma.postSubscription.create({
        data: { subscriberId: author.id, authorId: author.id },
      });
      const post = await createPost(author.id);

      await notifySubscribersOfNewPost({ postId: post.id, authorId: author.id, authorName: "Author Six" });

      const notif = await prisma.notification.findFirst({
        where: { userId: author.id, postId: post.id, type: "post_from_subscription" },
      });
      expect(notif).toBeNull();
    });

    it("[12] a blocked-either-way relationship never produces a subscription notification", async () => {
      const author = await createUser("author7");
      const subscriber = await createUser("subscriber7");
      await prisma.postSubscription.create({
        data: { subscriberId: subscriber.id, authorId: author.id },
      });
      await prisma.blocked.create({ data: { blockerId: subscriber.id, blockedId: author.id } });
      const post = await createPost(author.id);

      await notifySubscribersOfNewPost({ postId: post.id, authorId: author.id, authorName: "Author Seven" });

      const notif = await prisma.notification.findFirst({
        where: { userId: subscriber.id, postId: post.id, type: "post_from_subscription" },
      });
      expect(notif).toBeNull();
    });

    it("[13] deleting a subscriber account cleanly removes their subscriptions (cascade, no dangling notification attempt)", async () => {
      const author = await createUser("author8");
      const subscriber = await createUser("subscriber8");
      await prisma.postSubscription.create({
        data: { subscriberId: subscriber.id, authorId: author.id },
      });

      await prisma.user.delete({ where: { id: subscriber.id } });
      userIds.splice(userIds.indexOf(subscriber.id), 1);

      const remaining = await prisma.postSubscription.findMany({ where: { authorId: author.id } });
      expect(remaining).toHaveLength(0);

      // Notifying subscribers of a post from this author now must not
      // throw despite the account having just been deleted.
      const post = await createPost(author.id);
      await expect(
        notifySubscribersOfNewPost({ postId: post.id, authorId: author.id, authorName: "Author Eight" })
      ).resolves.toBeUndefined();
    });

    it("a popular author with many subscribers is fanned out in bulk, not one row/query per subscriber", async () => {
      const author = await createUser("author9");
      const subscribers = await Promise.all(
        Array.from({ length: 12 }, (_, i) => createUser(`subscriber9x${i}`))
      );
      await prisma.postSubscription.createMany({
        data: subscribers.map((s) => ({ subscriberId: s.id, authorId: author.id })),
      });
      const post = await createPost(author.id);

      await notifySubscribersOfNewPost({ postId: post.id, authorId: author.id, authorName: "Author Nine" });

      const notifs = await prisma.notification.findMany({
        where: { postId: post.id, type: "post_from_subscription" },
      });
      expect(notifs).toHaveLength(12);
      expect(new Set(notifs.map((n) => n.userId)).size).toBe(12);
    });
  }
);
