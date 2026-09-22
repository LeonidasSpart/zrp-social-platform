import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { parseCursorParams, buildPage } from "@/lib/pagination";
import { getConversationParticipant } from "@/lib/conversations";
import { sendPushNotification } from "@/lib/push-notifications";
import { isAllowedMediaUrl } from "@/lib/media-url";

const MAX_MESSAGE_LENGTH = 10000;

const MESSAGE_INCLUDE = {
  sender: { select: { id: true, username: true, name: true, avatarUrl: true, badgeType: true } },
  replyTo: {
    include: {
      sender: { select: { id: true, username: true, name: true, avatarUrl: true, badgeType: true } },
    },
  },
  reactions: { include: { user: { select: { id: true, username: true, name: true, avatarUrl: true } } } },
} as const;

// ─── GET real message history for this group, paginated ─────────────
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const limit = await rateLimit(req, { limit: 60, window: 60, type: "conversation-messages-get" });
  if (!limit.success) return limit.response!;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membership = await getConversationParticipant(id, session.user.id);
  if (!membership) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  try {
    const { cursor, limit: pageSize } = parseCursorParams(req);
    const rawMessages = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: MESSAGE_INCLUDE,
    });

    const { items, nextCursor } = buildPage(rawMessages, pageSize);

    // Opening a group conversation clears its unread count, the same
    // real behavior 1:1's own GET /messages/{userId} already has -
    // advances this participant's own read pointer to now rather than
    // to the last message's own timestamp, so a message that arrives
    // in the gap between this read and the client actually rendering
    // it is never silently marked read without being seen.
    await prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId: id, userId: session.user.id } },
      data: { lastReadAt: new Date() },
    });

    return NextResponse.json({ items: items.reverse(), nextCursor });
  } catch (error) {
    console.error("Error fetching group messages:", error);
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}

// ─── POST send a real message into this group ────────────────────────
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const limit = await rateLimit(req, { limit: 60, window: 3600, type: "conversation-messages-send" });
  if (!limit.success) return limit.response!;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membership = await getConversationParticipant(id, session.user.id);
  if (!membership) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  try {
    const { content, imageUrl, replyToId } = await req.json();

    if ((!content || content.trim().length === 0) && !imageUrl) {
      return NextResponse.json({ error: "Message content or image is required" }, { status: 400 });
    }
    if (content && content.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ error: "Message is too long" }, { status: 400 });
    }

    // ⚠️ SECURITY: same rule as 1:1 chat and posts - an attachment is
    // rendered straight into every member's thread, so it must come from
    // a source ZRP itself hands out (UploadThing, the GIF picker), never
    // an arbitrary host or scheme. See src/lib/media-url.ts.
    if (imageUrl && !isAllowedMediaUrl(imageUrl)) {
      return NextResponse.json(
        { error: "Attachments must be uploaded through ZRP or chosen from the GIF picker." },
        { status: 400 }
      );
    }

    // Replying only to a real message already in THIS conversation -
    // same real-boundary check 1:1 messaging's own POST /api/messages
    // already applies, just scoped to conversationId instead of a
    // sender/receiver pair.
    let validReplyToId: string | null = null;
    if (replyToId) {
      const target = await prisma.message.findUnique({
        where: { id: replyToId },
        select: { conversationId: true },
      });
      if (target?.conversationId === id) validReplyToId = replyToId;
    }

    const message = await prisma.message.create({
      data: {
        content: content?.trim() || "",
        senderId: session.user.id,
        conversationId: id,
        imageUrl: imageUrl || null,
        replyToId: validReplyToId,
      },
      include: MESSAGE_INCLUDE,
    });

    // Sending doesn't advance the sender's own lastReadAt to a future
    // message someone else sends a moment later - only touch it here
    // to make sure it's at least caught up to the message just sent.
    await prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId: id, userId: session.user.id } },
      data: { lastReadAt: message.createdAt },
    });

    // ─── Notify every OTHER current participant ───────────────────────
    // Real participant rows only - someone removed a moment before this
    // send can no longer be notified, matching how their removal
    // already revokes read access too (see ConversationParticipant's
    // own KDoc). In-app Notification rows are deliberately never created
    // here: the Messages page/badge (Message.read via
    // /api/messages/unread) is the single source of truth for message
    // unread state, for groups exactly as for 1:1 (see the matching,
    // now-removed createNotification call this file's 1:1 sibling
    // (messages/route.ts) used to make, and the "message"-type exclusion
    // in /api/notifications and /api/notifications/unread). Real push
    // notifications don't have that constraint (a free-form url), so
    // those still go out for real below.
    const otherParticipants = await prisma.conversationParticipant.findMany({
      where: { conversationId: id, userId: { not: session.user.id } },
      select: { userId: true },
    });

    const conversation = await prisma.conversation.findUnique({ where: { id }, select: { name: true } });
    const groupName = conversation?.name || "a group";
    const notificationMessage = imageUrl
      ? `${session.user.name || session.user.username} sent an image in ${groupName}`
      : `${session.user.name || session.user.username} sent a message in ${groupName}`;

    await Promise.all(
      otherParticipants.map(async ({ userId }) => {
        try {
          await sendPushNotification(userId, groupName, notificationMessage, `/messages/group/${id}`);
        } catch (notifErr) {
          console.error("Group push notification failed:", notifErr);
        }
      })
    );

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error("Error sending group message:", error);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
