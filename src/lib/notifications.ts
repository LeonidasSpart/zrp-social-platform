import { prisma } from "./db";
import { sendEmail } from "./email"; // Assumes you have a sendEmail function

interface CreateNotificationParams {
  userId: string;
  type: "like" | "comment" | "follow" | "repost" | "mention";
  fromUserId: string;
  postId?: string;
}

// ─── Default preferences (all true) ──────────────────────────────
const defaultPreferences = {
  likes: true,
  comments: true,
  follows: true,
  reposts: true,
  mentions: true,
  messages: true, // optional, but we include it for completeness
};

export async function createNotification({
  userId,
  type,
  fromUserId,
  postId,
}: CreateNotificationParams) {
  if (userId === fromUserId) return;

  // ─── 1. Create in‑app notification (always) ──────────────────────
  let notification;
  try {
    notification = await prisma.notification.create({
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

  // ─── 2. Check email preferences ──────────────────────────────────
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, emailPreferences: true },
    });

    if (!user?.email) return; // No email to send

    // Get preferences or fallback to defaults
    const prefs = user.emailPreferences || defaultPreferences;

    // Map notification type to preference key
    const typeMap: Record<string, string> = {
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

    // ─── 3. Send email ──────────────────────────────────────────────
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
    // Log the error but don't fail – the in-app notification already exists.
    console.error("Error sending email notification:", error);
  }
}
