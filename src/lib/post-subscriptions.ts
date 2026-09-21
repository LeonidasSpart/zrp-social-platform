import { prisma } from "./db";
import { emitToUser } from "./socket-emit";
import { sendPushNotification } from "./push-notifications";

/**
 * Fans a newly-published post out to everyone subscribed to the
 * author's posts ("notify me when this account posts" - PostSubscription
 * in prisma/schema.prisma). Called once per post, right after it becomes
 * publicly visible - both from the immediate-publish path
 * (POST /api/posts) and from the scheduled-publish cron
 * (publish-scheduled-posts), never from post creation itself when the
 * post is only "scheduled".
 *
 * Deliberately bulk end-to-end rather than the one-createNotification-
 * call-per-recipient loop the rest of this codebase uses for small,
 * bounded fan-outs (mentions, ticket-created-to-admins): a popular
 * account's subscriber count isn't bounded the way a handful of
 * @mentions is, so this does the subscriber lookup, the block filter,
 * and the Notification inserts each as ONE query regardless of how many
 * subscribers there are.
 */
export async function notifySubscribersOfNewPost({
  postId,
  authorId,
  authorName,
}: {
  postId: string;
  authorId: string;
  authorName: string;
}): Promise<void> {
  try {
    await notifySubscribersOfNewPostInternal({ postId, authorId, authorName });
  } catch (error) {
    // Callers deliberately don't await this (see call sites) so a
    // subscriber fan-out failure can never fail or slow down post
    // creation itself - caught here instead of left as an unhandled
    // promise rejection, same "log, don't throw" contract
    // createNotification's own DB-write try/catch already uses.
    console.error("Error notifying post subscribers:", error);
  }
}

async function notifySubscribersOfNewPostInternal({
  postId,
  authorId,
  authorName,
}: {
  postId: string;
  authorId: string;
  authorName: string;
}): Promise<void> {
  const subscriptions = await prisma.postSubscription.findMany({
    where: { authorId },
    select: { subscriberId: true },
  });
  if (subscriptions.length === 0) return;

  const subscriberIds = subscriptions.map((s) => s.subscriberId);

  // ⚠️ SECURITY/PRIVACY: same blocked-either-way rule every other
  // notification type goes through via createNotification's own check -
  // reimplemented here in bulk (one query for the whole subscriber list)
  // rather than looping isBlockedEitherWay per subscriber, which would
  // reintroduce the exact one-query-per-recipient cost this function
  // exists to avoid.
  const blocks = await prisma.blocked.findMany({
    where: {
      OR: [
        { blockerId: authorId, blockedId: { in: subscriberIds } },
        { blockerId: { in: subscriberIds }, blockedId: authorId },
      ],
    },
    select: { blockerId: true, blockedId: true },
  });
  const blockedSubscriberIds = new Set(
    blocks.map((b) => (b.blockerId === authorId ? b.blockedId : b.blockerId))
  );

  // authorId is filtered defensively (self-subscription is already
  // rejected at the API layer, so subscriberIds should never contain it,
  // but a post's own author must never be notified about their own post
  // regardless of how that ever happened).
  const recipientIds = subscriberIds.filter(
    (id) => id !== authorId && !blockedSubscriberIds.has(id)
  );
  if (recipientIds.length === 0) return;

  // One INSERT for every recipient. skipDuplicates relies on the
  // partial unique index the migration adds on (userId, postId) scoped
  // to type = 'post_from_subscription' (a post has exactly one author,
  // so that pair alone is a safe dedup key for this type only) - a
  // second fan-out call for the same post is a structural no-op instead
  // of depending on this function only ever being called once.
  await prisma.notification.createMany({
    data: recipientIds.map((userId) => ({
      userId,
      type: "post_from_subscription",
      fromUserId: authorId,
      postId,
    })),
    skipDuplicates: true,
  });

  // Realtime bell-badge nudge - in-memory Socket.IO emit per recipient,
  // no DB query, the same fire-per-user shape createNotification's own
  // emitToUser already uses for a single recipient.
  for (const userId of recipientIds) {
    emitToUser(userId, "notification:new", { type: "post_from_subscription" });
  }

  // Push delivery: fire-and-forget, not awaited, so a popular author's
  // post-creation request never waits on N outbound push calls. Safe
  // here specifically because this app runs as a persistent Node
  // process (server.js on Railway), not a serverless function that gets
  // torn down the moment the response is sent - see CLAUDE.md.
  // sendPushNotification is itself per-recipient (queries that user's
  // FcmToken/PushSubscription rows) since no bulk-push primitive exists
  // in this codebase yet; rewriting that layer is a separate, unrelated
  // undertaking.
  void Promise.allSettled(
    recipientIds.map((userId) =>
      sendPushNotification(userId, "New Post", `${authorName} just posted.`, `/post/${postId}`)
    )
  );
}
