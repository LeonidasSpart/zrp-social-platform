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
    | "message"
    | "follow_request"
    | "ticket_reply"
    | "ticket_resolved"
    | "ticket_closed"
    | "ticket_created"
    | "appeal_resolved"
    | "listing_approved"
    | "listing_rejected"
    | "listing_removed"
    | "play_duel_challenge"
    | "play_duel_accepted"
    | "play_duel_result";
  fromUserId: string;
  postId?: string;
  ticketId?: string; // ✅ added for ticket links
  ticketSubject?: string; // ✅ added for ticket subject in email
  listingId?: string; // ZRP Market Plus - links a listing approval/rejection email to the listing
  duelId?: string; // ZRP PLAY - links a duel notification email to the duel
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
  listingId,
  duelId,
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
    // Likes, comments, reposts, DMs, mentions, and new-follower events
    // never send email, full stop - regardless of stored user
    // preference. These are all engagement events the person already
    // sees the moment they open the app via the in-app notification
    // created above, and every single one was consuming Resend's
    // limited quota for no real benefit. Verification and password-reset
    // emails are handled by a completely separate function
    // (sendVerificationEmail in email.ts, not this one) and are
    // untouched by this change.
    const NEVER_EMAIL_TYPES = new Set([
      "like",
      "comment",
      "repost",
      "message",
      "mention",
      "follow",
      "play_duel_challenge",
      "play_duel_accepted",
    ]);
    if (NEVER_EMAIL_TYPES.has(type)) return;

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
      message: "messages",
      follow_request: "followRequests",
      ticket_reply: "supportTickets", // ✅ added
      ticket_resolved: "supportTickets", // ✅ added
      ticket_closed: "supportTickets", // ✅ added
      ticket_created: "supportTickets", // ✅ added
    };
    // A moderation-appeal outcome is rare and consequential enough that
    // it should always reach the user by email - there's no preference
    // toggle for it (nor for support tickets above), so it isn't gated
    // on one. This only changes behavior for that one new type: every
    // other type already has a typeMap entry today, so the gate below
    // is unchanged for all of them.
    const prefKey = typeMap[type];
    if (prefKey && prefs[prefKey] === false) return;

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
      message: { action: "sent you a message", emoji: "✉️" },
      follow_request: { action: "sent you a follow request", emoji: "🔒" },
      ticket_reply: { action: "replied to your support ticket", emoji: "📩" },
      ticket_resolved: { action: "resolved your support ticket", emoji: "✅" },
      ticket_closed: { action: "closed your support ticket", emoji: "🔒" },
      ticket_created: { action: "created a new support ticket", emoji: "🎫" }, // for admins
      appeal_resolved: { action: "resolved your moderation appeal", emoji: "⚖️" },
      listing_approved: { action: "approved your marketplace listing", emoji: "✅" },
      listing_rejected: { action: "didn't approve your marketplace listing", emoji: "🚫" },
      listing_removed: { action: "removed your marketplace listing", emoji: "⚠️" },
      play_duel_challenge: { action: "challenged you to a ZRP PLAY duel", emoji: "⚔️" },
      play_duel_accepted: { action: "accepted your ZRP PLAY duel", emoji: "🎮" },
      play_duel_result: { action: "finished your ZRP PLAY duel", emoji: "🏆" },
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

    // Messages don't have a postId - link straight to the conversation
    // with the sender instead.
    if (type === "message") {
      postUrl = `${process.env.NEXTAUTH_URL}/messages/${actorUsername}`;
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

    // Appeal resolutions link to the user's own appeals list, not a
    // ticket or post - a dedicated block same as tickets above, rather
    // than forcing it through the "actor liked/commented" engagement
    // template.
    if (type === "appeal_resolved") {
      const appealsUrl = `${process.env.NEXTAUTH_URL}/settings/appeals`;
      customHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb;">
          <div style="text-align: center; margin-bottom: 24px;">
            <img src="https://zrp.one/logo.png" alt="ZRP" style="height: 40px;" />
          </div>
          <div style="font-size: 48px; text-align: center; margin-bottom: 16px;">${emoji}</div>
          <h1 style="font-size: 22px; font-weight: 700; color: #111827; margin: 0 0 8px 0; text-align: center;">A moderation appeal you filed has been resolved</h1>
          <p style="font-size: 14px; color: #6b7280; text-align: center; margin: 0 0 24px 0;">See the outcome and any staff note on your appeals page.</p>
          <a href="${appealsUrl}" style="display: inline-block; background-color: #FF2D2D; color: #ffffff; font-weight: 600; padding: 12px 24px; border-radius: 8px; text-decoration: none; text-align: center; margin: 0 auto; display: table;">
            View Appeal
          </a>
        </div>
      `;
    }

    // Listing approval/rejection - same dedicated-block pattern as
    // appeals above. Links straight to the listing when approved (it's
    // live and shareable); back to the seller's own dashboard when
    // rejected (the listing itself isn't publicly visible yet).
    if (type === "listing_approved" || type === "listing_rejected" || type === "listing_removed") {
      const isApproved = type === "listing_approved";
      const listingUrl = isApproved && listingId
        ? `${process.env.NEXTAUTH_URL}/marketplace/listing/${listingId}`
        : `${process.env.NEXTAUTH_URL}/marketplace/my-listings`;
      const heading = isApproved
        ? "Your marketplace listing is live"
        : type === "listing_removed"
          ? "Your marketplace listing was removed"
          : "Your marketplace listing needs changes";
      const body = isApproved
        ? "It's now visible to the ZRP Market Plus community."
        : type === "listing_removed"
          ? "It was taken down by our moderation team for violating marketplace guidelines. Check your seller dashboard for details."
          : "Check your seller dashboard for the reviewer's note, then resubmit.";
      customHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb;">
          <div style="text-align: center; margin-bottom: 24px;">
            <img src="https://zrp.one/logo.png" alt="ZRP" style="height: 40px;" />
          </div>
          <div style="font-size: 48px; text-align: center; margin-bottom: 16px;">${emoji}</div>
          <h1 style="font-size: 22px; font-weight: 700; color: #111827; margin: 0 0 8px 0; text-align: center;">${heading}</h1>
          <p style="font-size: 14px; color: #6b7280; text-align: center; margin: 0 0 24px 0;">${body}</p>
          <a href="${listingUrl}" style="display: inline-block; background-color: #FF2D2D; color: #ffffff; font-weight: 600; padding: 12px 24px; border-radius: 8px; text-decoration: none; text-align: center; margin: 0 auto; display: table;">
            ${isApproved ? "View Listing" : "View My Listings"}
          </a>
        </div>
      `;
    }

    // Duel challenge/accepted/result - same dedicated-block pattern as
    // listings above. Always links straight to the duel itself.
    if (type === "play_duel_challenge" || type === "play_duel_accepted" || type === "play_duel_result") {
      const duelUrl = duelId
        ? `${process.env.NEXTAUTH_URL}/play/duel/${duelId}`
        : `${process.env.NEXTAUTH_URL}/play/duels`;
      const heading =
        type === "play_duel_challenge"
          ? `${actorName} challenged you to a duel!`
          : type === "play_duel_accepted"
            ? `${actorName} accepted your duel challenge`
            : "Your duel has finished";
      const body =
        type === "play_duel_challenge"
          ? "Play the same challenge and see who scores higher."
          : type === "play_duel_accepted"
            ? "It's on. Play the challenge to lock in your score."
            : "See who won on the duel page.";
      customHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb;">
          <div style="text-align: center; margin-bottom: 24px;">
            <img src="https://zrp.one/logo.png" alt="ZRP" style="height: 40px;" />
          </div>
          <div style="font-size: 48px; text-align: center; margin-bottom: 16px;">${emoji}</div>
          <h1 style="font-size: 22px; font-weight: 700; color: #111827; margin: 0 0 8px 0; text-align: center;">${heading}</h1>
          <p style="font-size: 14px; color: #6b7280; text-align: center; margin: 0 0 24px 0;">${body}</p>
          <a href="${duelUrl}" style="display: inline-block; background-color: #FF2D2D; color: #ffffff; font-weight: 600; padding: 12px 24px; border-radius: 8px; text-decoration: none; text-align: center; margin: 0 auto; display: table;">
            View Duel
          </a>
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
      message: `${actorName} sent you a message`,
      follow_request: `${actorName} sent you a follow request`,
      ticket_reply: `${actorName} replied to your support ticket`,
      ticket_resolved: `Your support ticket has been resolved`,
      ticket_closed: `Your support ticket has been closed`,
      ticket_created: `New support ticket from ${actorName}`,
      appeal_resolved: "Your moderation appeal has been resolved",
      listing_approved: "Your marketplace listing is live",
      listing_rejected: "Your marketplace listing needs changes",
      listing_removed: "Your marketplace listing was removed",
      play_duel_challenge: `${actorName} challenged you to a ZRP PLAY duel`,
      play_duel_accepted: `${actorName} accepted your ZRP PLAY duel`,
      play_duel_result: "Your ZRP PLAY duel has finished",
    };
    const subject = subjectMap[type] || "New notification from ZRP";

    // ─── 8. Send email ──────────────────────────────────────────────
    await sendEmail({
      to: user.email,
      subject,
      html: customHtml,
    });
  } catch (error) {
    // Log but don't fail: the in‑app notification already exists.
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
