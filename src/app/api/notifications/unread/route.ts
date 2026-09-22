import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, { limit: 120, window: 60, type: "notifications-unread-count" });
  if (!limited.success) return limited.response;

  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const count = await prisma.notification.count({
      where: {
        userId: session.user.id,
        read: false,
        // Messages have their own dedicated unread source of truth
        // (Message.read, surfaced via /api/messages/unread and the
        // Messages nav badge) - counting "message"-type rows here too
        // double-counted the same unread message as both the bell badge
        // and the Messages badge. Excluded here rather than merging the
        // two read-flags, matching how messages/route.ts no longer
        // creates this notification type going forward; this filter
        // also cleanly absorbs any pre-existing "message" rows written
        // before that change.
        type: { not: "message" },
      },
    });

    return NextResponse.json({ count });
  } catch (error) {
    console.error("Error fetching unread count:", error);
    return NextResponse.json({ error: "Failed to fetch unread count" }, { status: 500 });
  }
}
