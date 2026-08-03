import { prisma } from "./db";
import { sendEmail, buildNotificationEmail } from "./email";

interface CreateNotificationParams {
  userId: string;
  type: "like" | "comment" | "follow" | "repost" | "mention";
  fromUserId: string;
  postId?: string;
}

const defaultPreferences = {
  likes: true,
  comments: true,
  follows: true,
  reposts: true,
  mentions: true,
  messages: true,
};

type Preferences = typeof defaultPreferences;

export async function createNotification({
  userId,
  type,
  fromUserId,
  postId,
}: CreateNotificationParams) {
  if (userId === fromUserId) return;

  // ─── 1. Create in‑app notification (always) ──────────────────────
  try {
    await prisma.notification.create({
      data: {
        userId,
        type,
        fromUserId,
        postId,
      },
    });
  } catch (error) {
    console.error("Error creating notification:", error);
    return;
  }

  // ─── 2. Check email preferences and send email ────────────────────
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, emailPreferences: true },
    });

    if (!user?.email) return; // no email to send

    const prefs = (user.emailPreferences || defaultPreferences) as Preferences;
    const typeMap: Record<string, keyof Preferences> = {
      like: "likes",
      comment: "comments",
      follow: "follows",
      repost: "reposts",
      mention: "mentions",
    };
    const prefKey = typeMap[type];
    if (!prefKey || prefs[prefKey] === false) return;

    // ─── 3. Fetch actor info ──────────────────────────────────────
    const fromUser = await prisma.user.findUnique({
      where: { id: fromUserId },
      select: { name: true, username: true },
    });

    const actorName = fromUser?.name || fromUser?.username || "Someone";
    const actorUsername = fromUser?.username || "unknown";

    // ─── 4. Define action & emoji per type ──────────────────────────
    const actionMap: Record<string, { action: string; emoji: string }> = {
      like: { action: "liked your post", emoji: "❤️" },
      comment: { action: "commented on your post", emoji: "💬" },
      follow: { action: "started following you", emoji: "👋" },
      repost: { action: "reposted your post", emoji: "🔄" },
      mention: { action: "mentioned you in a post", emoji: "📝" },
    };
    const { action, emoji } = actionMap[type] || { action: "interacted with you", emoji: "🔔" };

    // ─── 5. Fetch post content (if applicable) ──────────────────────
    let postContent = "";
    if (postId) {
      const post = await prisma.post.findUnique({
        where: { id: postId },
        select: { content: true },
      });
      if (post) postContent = post.content;
    }

    const postUrl = postId ? `${process.env.NEXTAUTH_URL}/post/${postId}` : undefined;

    // ─── 6. Build professional email HTML ──────────────────────────
    const html = buildNotificationEmail({
      recipientName: user.name || "there",
      actorName,
      actorUsername,
      action,
      postContent,
      postUrl,
      actionEmoji: emoji,
    });

    // ─── 7. Subject ──────────────────────────────────────────────────
    const subjectMap: Record<string, string> = {
      like: `${actorName} liked your post`,
      comment: `${actorName} commented on your post`,
      follow: `${actorName} started following you`,
      repost: `${actorName} reposted your post`,
      mention: `${actorName} mentioned you in a post`,
    };
    const subject = subjectMap[type] || "New notification from ZRP";

    // ─── 8. Send email ──────────────────────────────────────────────
    await sendEmail({
      to: user.email,
      subject,
      html,
    });
  } catch (error) {
    // Log but don't fail – the in‑app notification already exists.
    console.error("Error sending email notification:", error);
  }
}
