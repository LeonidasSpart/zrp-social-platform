import { prisma } from "./db";
import { sendEmail } from "./email";

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

    // Cast preferences to our type, fallback to defaults
    const prefs = (user.emailPreferences || defaultPreferences) as Preferences;

    // Map notification type to preference key
    const typeMap: Record<string, keyof Preferences> = {
      like: "likes",
      comment: "comments",
      follow: "follows",
      repost: "reposts",
      mention: "mentions",
    };
    const prefKey = typeMap[type];
    if (!prefKey) return; // unknown type

    // If user opted out, skip email
    if (prefs[prefKey] === false) return;

    // ─── 3. Fetch sender info ──────────────────────────────────────
    const fromUser = await prisma.user.findUnique({
      where: { id: fromUserId },
      select: { name: true, username: true },
    });

    const subjectMap: Record<string, string> = {
      like: `${fromUser?.name || "Someone"} liked your post`,
      comment: `${fromUser?.name || "Someone"} commented on your post`,
      follow: `${fromUser?.name || "Someone"} started following you`,
      repost: `${fromUser?.name || "Someone"} reposted your post`,
      mention: `${fromUser?.name || "Someone"} mentioned you in a post`,
    };

    const actionText: Record<string, string> = {
      like: "liked your post",
      comment: "commented on your post",
      follow: "started following you",
      repost: "reposted your post",
      mention: "mentioned you in a post",
    };

    const subject = subjectMap[type] || "New notification from ZRP";
    const action = actionText[type] || "interacted with you";
    const postUrl = postId ? `${process.env.NEXT_PUBLIC_APP_URL}/post/${postId}` : null;

    const html = `
      <h2>Hello ${user.name || "there"}!</h2>
      <p><strong>${fromUser?.name || "Someone"}</strong> (${fromUser?.username || "unknown"}) ${action}.</p>
      ${postUrl ? `<p><a href="${postUrl}">View it here</a></p>` : ""}
      <p style="color:#888;font-size:12px;">You received this email because you have notifications enabled. To change your preferences, visit your <a href="${process.env.NEXT_PUBLIC_APP_URL}/settings">settings</a>.</p>
    `;

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
