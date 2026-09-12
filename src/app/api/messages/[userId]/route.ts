import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { parseCursorParams, buildPage } from "@/lib/pagination";

const MESSAGE_INCLUDE = {
  sender: {
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
  reactions: {
    include: {
      user: { select: { id: true, username: true, name: true, avatarUrl: true } },
    },
  },
} as const;

export async function GET(req: NextRequest, props: { params: Promise<{ userId: string }> }) {
  const params = await props.params;

  const limit = await rateLimit(req, { limit: 60, window: 60, type: "messages-get" });
  if (!limit.success) return limit.response!;

  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const currentUserId = session.user.id;
    const otherUserId = params.userId;

    // "Delete conversation" (DELETE /api/messages/conversation/[userId])
    // only clears the caller's own view - see ConversationClearance's own
    // KDoc - so anything at or before that marker must stay excluded from
    // this account's history, even though the rows (and the other
    // participant's own view of them) are untouched.
    const clearance = await prisma.conversationClearance.findUnique({
      where: { userId_otherUserId: { userId: currentUserId, otherUserId } },
      select: { clearedBefore: true },
    });

    const conversationFilter = {
      OR: [
        { senderId: currentUserId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: currentUserId },
      ],
      ...(clearance ? { createdAt: { gt: clearance.clearedBefore } } : {}),
    };

    // Mark messages as read regardless of how much of the conversation
    // this particular page request covers - opening a conversation has
    // always cleared its entire unread count, not just whatever page of
    // history happened to be fetched.
    await prisma.message.updateMany({
      where: {
        senderId: otherUserId,
        receiverId: currentUserId,
        read: false,
      },
      data: { read: true },
    });

    const { searchParams } = req.nextUrl;
    const usesPagination = searchParams.has("cursor") || searchParams.has("limit");

    if (!usesPagination) {
      // No client in the wild (web's ChatInterface.tsx, the shipped
      // Android app) sends cursor/limit today, and both expect a bare
      // JSON array - switching that shape out from under them would
      // break message history for every already-installed client, not
      // just fail to add a feature. This branch keeps that exact
      // contract while fixing the actual bug: it used to fetch the
      // ENTIRE conversation on every open and every 5s poll, completely
      // unbounded. Capped to the newest page (chronological order,
      // exactly as before) is byte-for-byte identical to the old
      // response for the overwhelming majority of real conversations
      // (anything under the page size), and stops the unbounded query
      // for the rest.
      const { limit: defaultLimit } = parseCursorParams(req);
      const recent = await prisma.message.findMany({
        where: conversationFilter,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: defaultLimit,
        include: MESSAGE_INCLUDE,
      });
      return NextResponse.json(recent.reverse());
    }

    // Cursor-aware path: any client that explicitly asks for a page
    // (by sending `cursor` and/or `limit`) is understood to be able to
    // handle the `{items, nextCursor}` envelope every other paginated
    // route in this app already returns - see src/lib/pagination.ts.
    // Ordered newest-first for pagination (matching every other feed),
    // then reversed back to the chronological order a chat UI renders
    // in before returning.
    const { cursor, limit: pageSize } = parseCursorParams(req);
    const rawMessages = await prisma.message.findMany({
      where: conversationFilter,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: MESSAGE_INCLUDE,
    });

    const { items, nextCursor } = buildPage(rawMessages, pageSize);
    return NextResponse.json({ items: items.reverse(), nextCursor });
  } catch (error) {
    console.error("Error fetching messages:", error);
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}
