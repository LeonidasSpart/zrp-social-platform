import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Total unread message count across every conversation, for the small
// badge on the Messages nav item - mirrors notifications/unread exactly.
// (Per-conversation unread counts already existed for the message list
// itself; this is just the aggregate total for the nav badge.)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const count = await prisma.message.count({
      where: {
        receiverId: session.user.id,
        read: false,
      },
    });

    return NextResponse.json({ count });
  } catch (error) {
    console.error("Error fetching unread message count:", error);
    return NextResponse.json({ error: "Failed to fetch unread message count" }, { status: 500 });
  }
}
