import { prisma } from "./db";
import { createNotification } from "./notifications";

/*
 * Shared @mention -> notification resolution, used by both post creation
 * and comment creation (src/app/api/posts/route.ts,
 * src/app/api/posts/[id]/comments/route.ts). Before this, mentions were
 * parsed into Post.mentions on post creation but NEVER notified anyone
 * (confirmed by a full-repo audit - "mention" existed only as an unused
 * notification type), and comments had no mention parsing at all.
 *
 * Deliberately does NOT touch Post.mentions (a separate, pre-existing
 * denormalized array used elsewhere) - this only resolves usernames to
 * real users and fans out notifications, the missing half of the
 * feature.
 */

const MENTION_REGEX = /@([a-zA-Z0-9_]+)/g;

export function extractMentionedUsernames(content: string): string[] {
  const seen = new Set<string>();
  for (const match of Array.from(content.matchAll(MENTION_REGEX))) {
    seen.add(match[1].toLowerCase());
  }
  return Array.from(seen);
}

export async function notifyMentionedUsers({
  content,
  authorId,
  postId,
  excludeUserIds = [],
}: {
  content: string;
  authorId: string;
  postId: string;
  /**
   * Recipients who already got a notification for this same action
   * (e.g. the post author already got a "comment" notification, the
   * parent-comment author already got a "reply" one) - skipped here so
   * mentioning the person you're already replying to doesn't also fire
   * a second, redundant "mentioned you" notification for the same post.
   */
  excludeUserIds?: string[];
}): Promise<void> {
  const usernames = extractMentionedUsernames(content);
  if (usernames.length === 0) return;

  const mentionedUsers = await prisma.user.findMany({
    where: { username: { in: usernames, mode: "insensitive" } },
    select: { id: true },
  });

  const exclude = new Set([authorId, ...excludeUserIds]);
  for (const user of mentionedUsers) {
    if (exclude.has(user.id)) continue;
    // createNotification itself skips a self-notify and a
    // blocked/muted-either-way relationship - not duplicated here.
    await createNotification({
      userId: user.id,
      type: "mention",
      fromUserId: authorId,
      postId,
    });
  }
}
