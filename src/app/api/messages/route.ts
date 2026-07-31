import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendPushNotification } from "@/lib/push-notifications";
import { rateLimit } from "@/lib/rate-limit";

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
          },
        },
        receiver: {
          select: {
            id: true,
            username: true,
            name: true,
            avatarUrl: true,
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
    const { content, receiverId } = await req.json();

    if (!content || content.trim().length === 0) {
      return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });
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

    // ─── Save message ──────────────────────────────────────────────────
    const message = await prisma.message.create({
      data: {
        content: content.trim(),
        senderId: session.user.id,
        receiverId,
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            name: true,
            avatarUrl: true,
          },
        },
        receiver: {
          select: {
            id: true,
            username: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    });

    // ─── Send push notification (non‑blocking) ──────────────────────
    if (receiverId !== session.user.id) {
      try {
        await sendPushNotification(
          receiverId,
          "New Message",
          `${session.user.name || session.user.username} sent you a message.`,
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
