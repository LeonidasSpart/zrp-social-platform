import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendPushNotification } from "@/lib/push-notifications";
import { createNotification } from "@/lib/notifications";
import { rateLimit } from "@/lib/rate-limit";
import { getUserConversations } from "@/lib/conversations";
import { isAllowedMediaUrl } from "@/lib/media-url";

// Any message longer than this is far beyond anything a real DM needs -
// content is unbounded text in the schema, so without a cap this was an
// open-ended storage/abuse vector (one request could write megabytes
// into a single message row).
const MAX_MESSAGE_LENGTH = 10000;

// ─── GET conversations ──────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // Rate limit: 60 requests per minute (light)
  const limit = await rateLimit(req, { limit: 60, window: 60, type: "messages-get" });
  if (!limit.success) return limit.response;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = session.user.id;

    const conversations = await getUserConversations(userId);

    return NextResponse.json(conversations);
  } catch (error) {
    console.error("Error fetching conversations:", error);
    return NextResponse.json({ error: "Failed to fetch conversations" }, { status: 500 });
  }
}

// ─── POST send message ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Rate limit: 60 messages per hour
  const limit = await rateLimit(req, { limit: 60, window: 3600, type: "messages-send" });
  if (!limit.success) return limit.response;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { content, receiverId, imageUrl, replyToId, storyId } = await req.json();

    // Allow empty content only if there is an image
    if ((!content || content.trim().length === 0) && !imageUrl) {
      return NextResponse.json({ error: "Message content or image is required" }, { status: 400 });
    }

    if (content && content.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ error: "Message is too long" }, { status: 400 });
    }

    // ⚠️ SECURITY: a chat attachment is rendered straight into the
    // recipient's conversation, so - exactly as for post media - it must
    // come from a source ZRP itself hands out (an /api/upload result on
    // UploadThing, or the GIF picker), never an arbitrary host or
    // scheme. Write-side only; existing messages are untouched.
    if (imageUrl && !isAllowedMediaUrl(imageUrl)) {
      return NextResponse.json(
        { error: "Attachments must be uploaded through ZRP or chosen from the GIF picker." },
        { status: 400 }
      );
    }

    if (!receiverId && !storyId) {
      return NextResponse.json({ error: "Receiver ID required" }, { status: 400 });
    }

    // ─── Story reply: resolve + authorize against the real DB row ─────
    // A story reply is an ordinary private DM tagged with which Story
    // prompted it (see Message.storyId) - deliberately not a separate
    // messaging system. The recipient is always derived from the
    // Story's own userId, never trusted from the client, so a caller
    // can't send storyId plus an unrelated receiverId to redirect a
    // "story reply" notification/label onto someone else's inbox.
    let resolvedReceiverId: string = receiverId;
    let validStoryId: string | null = null;
    if (storyId) {
      const story = await prisma.story.findUnique({
        where: { id: storyId },
        select: { id: true, userId: true, expiresAt: true },
      });
      if (!story) {
        return NextResponse.json({ error: "Story not found" }, { status: 404 });
      }
      if (story.expiresAt <= new Date()) {
        // Matches GET /api/stories, which only ever serves
        // non-expired stories - once a story is no longer actively
        // shown to anyone, a new reply to it can't be authored either
        // (existing replies made before expiry are untouched - Message
        // rows are never deleted just because the Story they reference
        // expires later, see Message.storyId's own comment).
        return NextResponse.json({ error: "This story is no longer available" }, { status: 410 });
      }
      if (story.userId === session.user.id) {
        return NextResponse.json({ error: "You can't reply to your own story" }, { status: 400 });
      }
      // Same audience GET /api/stories computes (self + people you
      // follow) - a story is never shown to a non-follower, so a reply
      // from one must be rejected the same way, independent of
      // anything the client claims about visibility.
      const following = await prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: session.user.id, followingId: story.userId } },
        select: { id: true },
      });
      if (!following) {
        return NextResponse.json({ error: "You can't reply to this story" }, { status: 403 });
      }
      resolvedReceiverId = story.userId;
      validStoryId = story.id;
    }

    if (!resolvedReceiverId) {
      return NextResponse.json({ error: "Receiver ID required" }, { status: 400 });
    }

    // ─── Verify receiver exists ──────────────────────────────────────
    const receiver = await prisma.user.findUnique({
      where: { id: resolvedReceiverId },
      select: { id: true, username: true },
    });
    if (!receiver) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ─── Blocked check ────────────────────────────────────────────────
    // Neither direction was ever checked here - a user the receiver had
    // blocked could still message them freely, and (the less obvious
    // half) so could someone the SENDER themselves had blocked, since
    // blocking someone doesn't stop them from still being able to reach
    // you unless both directions are checked. Applies identically to a
    // story reply - blocking is always symmetric-effect wherever a DM
    // could otherwise be sent.
    if (resolvedReceiverId !== session.user.id) {
      const blockExists = await prisma.blocked.findFirst({
        where: {
          OR: [
            { blockerId: session.user.id, blockedId: resolvedReceiverId },
            { blockerId: resolvedReceiverId, blockedId: session.user.id },
          ],
        },
      });
      if (blockExists) {
        return NextResponse.json({ error: "Unable to send message to this user" }, { status: 403 });
      }
    }

    // ─── If replying, verify the target message belongs to this conversation ──
    let validReplyToId: string | null = null;
    if (replyToId) {
      const target = await prisma.message.findUnique({
        where: { id: replyToId },
        select: { senderId: true, receiverId: true },
      });
      const belongsToConversation =
        target &&
        [target.senderId, target.receiverId].includes(session.user.id) &&
        [target.senderId, target.receiverId].includes(resolvedReceiverId);
      if (belongsToConversation) validReplyToId = replyToId;
    }

    // ─── Save message ──────────────────────────────────────────────────
    const message = await prisma.message.create({
      data: {
        content: content?.trim() || "",
        senderId: session.user.id,
        receiverId: resolvedReceiverId,
        imageUrl: imageUrl || null,
        replyToId: validReplyToId,
        storyId: validStoryId,
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            name: true,
            avatarUrl: true,
            badgeType: true,
          },
        },
        receiver: {
          select: {
            id: true,
            username: true,
            name: true,
            avatarUrl: true,
            badgeType: true,
          },
        },
        replyTo: {
          include: {
            sender: {
              select: { id: true, username: true, name: true, avatarUrl: true, badgeType: true },
            },
          },
        },
        story: {
          select: { id: true, mediaUrl: true, mediaType: true, content: true },
        },
        reactions: true,
      },
    });

    // ─── Create in-app notification + send push (non‑blocking) ──────
    // Previously this only attempted a browser push notification, which
    // most people never grant permission for - so if push failed or
    // wasn't set up, there was no trace of the message anywhere in the
    // Notifications page at all. Now a durable in-app notification is
    // always created too, matching every other notification type. A
    // story reply reuses this exact same "message" notification (in-app
    // + push) rather than inventing a second notification type/path -
    // only the push copy is worded differently so the recipient knows
    // it was prompted by their story.
    if (resolvedReceiverId !== session.user.id) {
      try {
        await createNotification({
          userId: resolvedReceiverId,
          type: "message",
          fromUserId: session.user.id,
        });
      } catch (notifErr) {
        console.error("In-app message notification failed:", notifErr);
      }

      try {
        const senderName = session.user.name || session.user.username;
        const notificationMessage = validStoryId
          ? `${senderName} replied to your story.`
          : imageUrl
          ? `${senderName} sent you an image.`
          : `${senderName} sent you a message.`;
        await sendPushNotification(
          resolvedReceiverId,
          validStoryId ? "New Story Reply" : "New Message",
          notificationMessage,
          `/messages/${session.user.username}`
        );
      } catch (notifErr) {
        console.error("Push notification failed:", notifErr);
        // Fail silently: message still delivered
      }
    }

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error("Error sending message:", error);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
