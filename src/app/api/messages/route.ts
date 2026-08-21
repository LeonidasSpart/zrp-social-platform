import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendPushNotification } from "@/lib/push-notifications";
import { createNotification } from "@/lib/notifications";
import { rateLimit } from "@/lib/rate-limit";

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

    // Get distinct conversations via latest messages
    const conversations = await prisma.message.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      orderBy: { createdAt: "desc" },
      distinct: ["senderId", "receiverId"],
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
      },
    });

    const conversationMap = new Map();
    conversations.forEach((msg) => {
      const partnerId = msg.senderId === userId ? msg.receiverId : msg.senderId;
      const partner = msg.senderId === userId ? msg.receiver : msg.sender;
      if (!conversationMap.has(partnerId)) {
        conversationMap.set(partnerId, {
          partner,
          lastMessage: msg,
          unreadCount: 0,
        });
      }
    });

    // Count unread messages per sender
    const unreadMessages = await prisma.message.groupBy({
      by: ["senderId"],
      where: {
        receiverId: userId,
        read: false,
      },
      _count: {
        senderId: true,
      },
    });

    unreadMessages.forEach((u) => {
      const conv = conversationMap.get(u.senderId);
      if (conv) {
        conv.unreadCount = u._count.senderId;
      }
    });

    return NextResponse.json(Array.from(conversationMap.values()));
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
    const { content, receiverId, imageUrl, replyToId } = await req.json();

    // Allow empty content only if there is an image
    if ((!content || content.trim().length === 0) && !imageUrl) {
      return NextResponse.json({ error: "Message content or image is required" }, { status: 400 });
    }

    if (content && content.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ error: "Message is too long" }, { status: 400 });
    }

    if (!receiverId) {
      return NextResponse.json({ error: "Receiver ID required" }, { status: 400 });
    }

    // ─── Verify receiver exists ──────────────────────────────────────
    const receiver = await prisma.user.findUnique({
      where: { id: receiverId },
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
    // you unless both directions are checked.
    if (receiverId !== session.user.id) {
      const blockExists = await prisma.blocked.findFirst({
        where: {
          OR: [
            { blockerId: session.user.id, blockedId: receiverId },
            { blockerId: receiverId, blockedId: session.user.id },
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
        [target.senderId, target.receiverId].includes(receiverId);
      if (belongsToConversation) validReplyToId = replyToId;
    }

    // ─── Save message ──────────────────────────────────────────────────
    const message = await prisma.message.create({
      data: {
        content: content?.trim() || "",
        senderId: session.user.id,
        receiverId,
        imageUrl: imageUrl || null,
        replyToId: validReplyToId,
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
        reactions: true,
      },
    });

    // ─── Create in-app notification + send push (non‑blocking) ──────
    // Previously this only attempted a browser push notification, which
    // most people never grant permission for - so if push failed or
    // wasn't set up, there was no trace of the message anywhere in the
    // Notifications page at all. Now a durable in-app notification is
    // always created too, matching every other notification type.
    if (receiverId !== session.user.id) {
      try {
        await createNotification({
          userId: receiverId,
          type: "message",
          fromUserId: session.user.id,
        });
      } catch (notifErr) {
        console.error("In-app message notification failed:", notifErr);
      }

      try {
        const notificationMessage = imageUrl
          ? `${session.user.name || session.user.username} sent you an image.`
          : `${session.user.name || session.user.username} sent you a message.`;
        await sendPushNotification(
          receiverId,
          "New Message",
          notificationMessage,
          `/messages/${session.user.username}`
        );
      } catch (notifErr) {
        console.error("Push notification failed:", notifErr);
        // Fail silently – message still delivered
      }
    }

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error("Error sending message:", error);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
