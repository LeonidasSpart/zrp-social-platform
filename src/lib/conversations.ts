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
  const latestPerPartner = await prisma.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT ON (partner_id) id
    FROM (
      SELECT
        id,
        "createdAt",
        CASE WHEN "senderId" = ${userId} THEN "receiverId" ELSE "senderId" END AS partner_id
      FROM "Message"
      WHERE "senderId" = ${userId} OR "receiverId" = ${userId}
    ) sub
    ORDER BY partner_id, "createdAt" DESC, id DESC
  `;

  if (latestPerPartner.length === 0) {
    return [];
  }

  const lastMessages = await prisma.message.findMany({
    where: { id: { in: latestPerPartner.map((r) => r.id) } },
    orderBy: { createdAt: "desc" },
    include: MESSAGE_INCLUDE,
  });

  const conversationMap = new Map<string, ConversationSummary>();
  lastMessages.forEach((msg) => {
    const partnerId = msg.senderId === userId ? msg.receiverId : msg.senderId;
    const partner = msg.senderId === userId ? msg.receiver : msg.sender;
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
