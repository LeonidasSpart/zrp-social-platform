import { prisma } from "./db";
import { sendEmail, buildNotificationEmail } from "./email";

interface CreateNotificationParams {
  userId: string;
  type:
    | "like"
    | "comment"
    | "follow"
    | "repost"
    | "mention"
    | "follow_request"
    | "ticket_reply"
    | "ticket_resolved"
    | "ticket_closed"
    | "ticket_created";
  fromUserId: string;
  postId?: string;
  ticketId?: string; // ✅ added for ticket links
  ticketSubject?: string; // ✅ added for ticket subject in email
}

const defaultPreferences = {
  likes: true,
  comments: true,
  follows: true,
  reposts: true,
  mentions: true,
  messages: true,
  followRequests: true,
  supportTickets: true, // ✅ added for ticket notifications
};

type Preferences = typeof defaultPreferences;

export async function createNotification({
  userId,
  type,
  fromUserId,
  postId,
  ticketId,
  ticketSubject,
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
        // For ticket notifications, we store the ticket ID in the message or link
        // Since the Notification model doesn't have a ticketId field, we store it in the link
        // Or you could add a new field to the schema
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
      follow_request: "followRequests",
      ticket_reply: "supportTickets", // ✅ added
      ticket_resolved: "supportTickets", // ✅ added
      ticket_closed: "supportTickets", // ✅ added
      ticket_created: "supportTickets", // ✅ added
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
      follow_request: { action: "sent you a follow request", emoji: "🔒" },
      ticket_reply: { action: "replied to your support ticket", emoji: "📩" },
      ticket_resolved: { action: "resolved your support ticket", emoji: "✅" },
      ticket_closed: { action: "closed your support ticket", emoji: "🔒" },
      ticket_created: { action: "created a new support ticket", emoji: "🎫" }, // for admins
    };
    const { action, emoji } = actionMap[type] || { action: "interacted with you", emoji: "🔔" };

    // ─── 5. Build URL and content ──────────────────────────────────
    let postContent = "";
    let postUrl: string | undefined;
    let ticketUrl: string | undefined;

    if (postId) {
      const post = await prisma.post.findUnique({
        where: { id: postId },
        select: { content: true },
      });
      if (post) postContent = post.content;
      postUrl = postId ? `${process.env.NEXTAUTH_URL}/post/${postId}` : undefined;
    }

    // ✅ Build ticket URL if ticketId is provided
    if (ticketId) {
      const isAdmin = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      // If the recipient is an admin, link to admin view; otherwise user view
      if (isAdmin?.role === "ADMIN") {
        ticketUrl = `${process.env.NEXTAUTH_URL}/admin/support/${ticketId}`;
      } else {
        ticketUrl = `${process.env.NEXTAUTH_URL}/support/tickets/${ticketId}`;
      }
    }

    // ─── 6. Build professional email HTML ──────────────────────────
    // For ticket notifications, we customize the email slightly
    let customHtml = buildNotificationEmail({
      recipientName: user.name || "there",
      actorName,
      actorUsername,
      action,
      postContent,
      postUrl,
      actionEmoji: emoji,
    });

    // ✅ If it's a ticket notification, override with ticket-specific content
    if (type.startsWith("ticket_") && ticketUrl) {
      const subjectText = ticketSubject || "support ticket";
      customHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb;">
          <div style="text-align: center; margin-bottom: 24px;">
            <img src="https://zrp.one/logo.png" alt="ZRP" style="height: 40px;" />
          </div>
          <div style="font-size: 48px; text-align: center; margin-bottom: 16px;">${emoji}</div>
          <h1 style="font-size: 24px; font-weight: 700; color: #111827; margin: 0 0 8px 0; text-align: center;">${actorName}</h1>
          <p style="font-size: 16px; color: #4b5563; text-align: center; margin: 0 0 24px 0;">${action}</p>
          <div style="background-color: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 24px; border-left: 4px solid #FF2D2D;">
            <p style="font-size: 14px; color: #6b7280; margin: 0 0 4px 0;">Ticket</p>
            <p style="font-size: 16px; font-weight: 600; color: #111827; margin: 0;">${subjectText}</p>
          </div>
          <a href="${ticketUrl}" style="display: inline-block; background-color: #FF2D2D; color: #ffffff; font-weight: 600; padding: 12px 24px; border-radius: 8px; text-decoration: none; text-align: center; margin: 0 auto; display: table;">
            View Ticket
          </a>
          <p style="font-size: 12px; color: #9ca3af; text-align: center; margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 16px;">
            You are receiving this email because you have notifications enabled for support tickets.<br />
            Manage your preferences in your <a href="${process.env.NEXTAUTH_URL}/settings/notifications" style="color: #FF2D2D; text-decoration: underline;">ZRP settings</a>.
          </p>
        </div>
      `;
    }

    // ─── 7. Subject ──────────────────────────────────────────────────
    const subjectMap: Record<string, string> = {
      like: `${actorName} liked your post`,
      comment: `${actorName} commented on your post`,
      follow: `${actorName} started following you`,
      repost: `${actorName} reposted your post`,
      mention: `${actorName} mentioned you in a post`,
      follow_request: `${actorName} sent you a follow request`,
      ticket_reply: `${actorName} replied to your support ticket`,
      ticket_resolved: `Your support ticket has been resolved`,
      ticket_closed: `Your support ticket has been closed`,
      ticket_created: `New support ticket from ${actorName}`,
    };
    const subject = subjectMap[type] || "New notification from ZRP";

    // ─── 8. Send email ──────────────────────────────────────────────
    await sendEmail({
      to: user.email,
      subject,
      html: customHtml,
    });
  } catch (error) {
    // Log but don't fail – the in‑app notification already exists.
    console.error("Error sending email notification:", error);
  }
}

// ─── Helper functions for ticket notifications ──────────────────────

interface NotifyTicketReplyParams {
  ticketId: string;
  ticketSubject: string;
  userId: string; // recipient (user or admin)
  fromUserId: string; // sender (admin or user)
  isAdminReply?: boolean;
}

export async function notifyTicketReply({
  ticketId,
  ticketSubject,
  userId,
  fromUserId,
  isAdminReply = false,
}: NotifyTicketReplyParams) {
  const type = isAdminReply ? "ticket_reply" : "ticket_reply";
  await createNotification({
    userId,
    type,
    fromUserId,
    ticketId,
    ticketSubject,
  });
}

export async function notifyTicketResolved({
  ticketId,
  ticketSubject,
  userId,
  fromUserId,
}: {
  ticketId: string;
  ticketSubject: string;
  userId: string;
  fromUserId: string;
}) {
  await createNotification({
    userId,
    type: "ticket_resolved",
    fromUserId,
    ticketId,
    ticketSubject,
  });
}

export async function notifyTicketClosed({
  ticketId,
  ticketSubject,
  userId,
  fromUserId,
}: {
  ticketId: string;
  ticketSubject: string;
  userId: string;
  fromUserId: string;
}) {
  await createNotification({
    userId,
    type: "ticket_closed",
    fromUserId,
    ticketId,
    ticketSubject,
  });
}

export async function notifyTicketCreated({
  ticketId,
  ticketSubject,
  adminIds,
  fromUserId,
}: {
  ticketId: string;
  ticketSubject: string;
  adminIds: string[];
  fromUserId: string;
}) {
  for (const adminId of adminIds) {
    await createNotification({
      userId: adminId,
      type: "ticket_created",
      fromUserId,
      ticketId,
      ticketSubject,
    });
  }
}
