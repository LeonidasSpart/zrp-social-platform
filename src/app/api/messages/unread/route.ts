import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getUserGroupConversations } from "@/lib/conversations";

// Total unread message count across every conversation, for the small
// badge on the Messages nav item - mirrors notifications/unread exactly.
// (Per-conversation unread counts already existed for the message list
// itself; this is just the aggregate total for the nav badge.)
//
// Real 1:1 unread (read=false on messages addressed to this user) plus
// real GROUP unread (getUserGroupConversations' own per-membership
// lastReadAt comparison, the same real source the group conversation
// list itself already uses - see conversations.ts's own KDoc on why a
// group has no per-message read row) - added together so the one nav
// badge stays accurate now that group conversations exist, instead of
// silently under-counting every unread group message.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [directCount, groupConversations] = await Promise.all([
      prisma.message.count({
        where: {
          receiverId: session.user.id,
          read: false,
        },
      }),
      getUserGroupConversations(session.user.id),
    ]);

    const groupCount = groupConversations.reduce((sum, c) => sum + c.unreadCount, 0);

    return NextResponse.json({ count: directCount + groupCount });
  } catch (error) {
    console.error("Error fetching unread message count:", error);
    return NextResponse.json({ error: "Failed to fetch unread message count" }, { status: 500 });
  }
}
