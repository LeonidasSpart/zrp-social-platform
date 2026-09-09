import { prisma } from "./db";
import { Prisma } from "@prisma/client";

const PARTNER_SELECT = {
  id: true,
  username: true,
  name: true,
  avatarUrl: true,
  badgeType: true,
} as const;

const MESSAGE_INCLUDE = {
  sender: { select: PARTNER_SELECT },
  receiver: { select: PARTNER_SELECT },
} as const;

type ConversationMessage = Prisma.MessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>;

export interface ConversationSummary {
  partner: ConversationMessage["sender"];
  lastMessage: ConversationMessage;
  unreadCount: number;
}

/**
 * Returns one entry per conversation partner - the partner's profile,
 * their most recent message with this user (in either direction), and
 * how many of their messages to this user are unread.
 *
 * ⚠️ PERFORMANCE: the previous implementation fetched every message
 * the user had ever sent or received (`findMany` with no `take`,
 * relying on Prisma's `distinct` + an in-memory JS reduction to find
 * the latest per partner) - a heavy user's inbox load scaled with
 * their *entire message history*, not their conversation count. This
 * uses a Postgres `DISTINCT ON` to find the latest message id per
 * partner directly in the database - the only unbounded scan is over
 * indexed id/timestamp columns, and the amount of data that ever
 * leaves Postgres is bounded by the number of distinct conversations,
 * never by total message volume.
 *
 * Every conversation the user has ever had is still returned in full
 * (this does not truncate the conversation list) - only the *messages
 * scanned per conversation* changes, from "all of them" to "the one
 * that matters".
 */
export async function getUserConversations(userId: string): Promise<ConversationSummary[]> {
  // conversationId IS NULL keeps this strictly to real 1:1 messages -
  // a real GROUP message (see Conversation's own KDoc) can have the
  // same userId as its senderId with a null receiverId, which would
  // otherwise surface here as a bogus "conversation with partner_id
  // NULL" row. Group conversations get their own real listing
  // (getUserGroupConversations), not folded into this 1:1-only query.
  const latestPerPartner = await prisma.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT ON (partner_id) id
    FROM (
      SELECT
        id,
        "createdAt",
        CASE WHEN "senderId" = ${userId} THEN "receiverId" ELSE "senderId" END AS partner_id
      FROM "Message"
      WHERE ("senderId" = ${userId} OR "receiverId" = ${userId}) AND "conversationId" IS NULL
    ) sub
    ORDER BY partner_id, "createdAt" DESC, id DESC
  `;

  if (latestPerPartner.length === 0) {
    return [];
  }

  const lastMessages = await prisma.message.findMany({
    where: { id: { in: latestPerPartner.map((r) => r.id) }, conversationId: null },
    orderBy: { createdAt: "desc" },
    include: MESSAGE_INCLUDE,
  });

  const conversationMap = new Map<string, ConversationSummary>();
  lastMessages.forEach((msg) => {
    const partnerId = msg.senderId === userId ? msg.receiverId : msg.senderId;
    const partner = msg.senderId === userId ? msg.receiver : msg.sender;
    // A real 1:1 message (the raw query above already excludes
    // conversationId IS NOT NULL rows) always has both senderId and
    // receiverId populated, so partnerId is never actually null here -
    // this guard exists to satisfy receiverId's now-nullable type, not
    // because it can happen for a row this query can even return.
    if (partnerId === null || partner === null) return;
    // Each partner_id appears exactly once in latestPerPartner (that's
    // what DISTINCT ON guarantees), so this can't overwrite an entry -
    // the check is just defensive.
    if (!conversationMap.has(partnerId)) {
      conversationMap.set(partnerId, { partner, lastMessage: msg, unreadCount: 0 });
    }
  });

  const unreadMessages = await prisma.message.groupBy({
    by: ["senderId"],
    where: { receiverId: userId, read: false },
    _count: { senderId: true },
  });

  unreadMessages.forEach((u) => {
    const conv = conversationMap.get(u.senderId);
    if (conv) {
      conv.unreadCount = u._count.senderId;
    }
  });

  return Array.from(conversationMap.values());
}

// ─── Group conversations ──────────────────────────────────────────────

const GROUP_MESSAGE_INCLUDE = {
  sender: { select: PARTNER_SELECT },
} as const;

type GroupMessage = Prisma.MessageGetPayload<{ include: typeof GROUP_MESSAGE_INCLUDE }>;

export interface GroupConversationSummary {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  participantCount: number;
  lastMessage: GroupMessage | null;
  unreadCount: number;
}

/**
 * Real server-side membership check every group route (REST and
 * Socket.IO alike) must run before returning or acting on anything
 * conversation-scoped - removing a participant deletes their row (see
 * ConversationParticipant's own KDoc), so "is this row still there" is
 * the entire authorization boundary. Never trust a client-claimed
 * conversationId/userId pairing without this.
 */
export async function getConversationParticipant(conversationId: string, userId: string) {
  return prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
}

/**
 * One entry per GROUP conversation this user currently belongs to
 * (their own ConversationParticipant row still exists - see
 * getConversationParticipant's own KDoc on why that's the real
 * membership boundary, not a soft flag). unreadCount is computed from
 * lastReadAt rather than a per-message-per-user row - see
 * ConversationParticipant's own schema KDoc for why.
 */
export async function getUserGroupConversations(userId: string): Promise<GroupConversationSummary[]> {
  const memberships = await prisma.conversationParticipant.findMany({
    where: { userId, conversation: { type: "GROUP" } },
    select: {
      conversationId: true,
      lastReadAt: true,
      conversation: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          _count: { select: { participants: true } },
        },
      },
    },
  });

  if (memberships.length === 0) return [];

  return Promise.all(
    memberships.map(async (m) => {
      const [lastMessage, unreadCount] = await Promise.all([
        prisma.message.findFirst({
          where: { conversationId: m.conversationId },
          orderBy: { createdAt: "desc" },
          include: GROUP_MESSAGE_INCLUDE,
        }),
        prisma.message.count({
          where: {
            conversationId: m.conversationId,
            senderId: { not: userId },
            createdAt: m.lastReadAt ? { gt: m.lastReadAt } : undefined,
          },
        }),
      ]);

      return {
        id: m.conversation.id,
        name: m.conversation.name,
        avatarUrl: m.conversation.avatarUrl,
        participantCount: m.conversation._count.participants,
        lastMessage,
        unreadCount,
      };
    })
  );
}
