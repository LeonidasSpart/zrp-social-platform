import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

/**
 * PUT /api/notifications/[id]/read
 * ============================================================
 * Marks exactly ONE notification read - confirmed missing entirely by
 * audit (only a bulk "mark every unread notification read" endpoint
 * existed at PUT /api/notifications). Opening the notifications list
 * should not blindly mark everything read; clicking one specific
 * notification should mark only that one.
 *
 * Auth: identity comes only from the verified session, never a
 * client-supplied userId. Ownership: the notification must belong to
 * the caller, or this 404s exactly like it doesn't exist - never
 * reveals whether a given id belongs to someone else. Idempotent:
 * marking an already-read notification read again is a harmless no-op
 * 200, not an error.
 */
export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;

  const limited = await rateLimit(req, { limit: 120, window: 60, type: "notification-mark-read" });
  if (!limited.success) return limited.response;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const notification = await prisma.notification.findUnique({
      where: { id: params.id },
      select: { id: true, userId: true },
    });

    if (!notification || notification.userId !== session.user.id) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 });
    }

    await prisma.notification.update({
      where: { id: params.id },
      data: { read: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error marking notification read:", error);
    return NextResponse.json({ error: "Failed to mark notification read" }, { status: 500 });
  }
}
