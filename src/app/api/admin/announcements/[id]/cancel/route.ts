import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit-log";
import { prisma } from "@/lib/db";
import { rateLimitByIpAndUser } from "@/lib/rate-limit";
import { cancelAnnouncement } from "@/lib/announcements/dispatch";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const limited = await rateLimitByIpAndUser(req, adminCheck.session.user.id, {
    limit: 20,
    window: 3600,
    type: "admin-announcement-cancel",
  });
  if (!limited.success) return limited.response;

  const { id } = await params;
  const existing = await prisma.announcement.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!existing) return NextResponse.json({ error: "Announcement not found" }, { status: 404 });

  const outcome = await cancelAnnouncement(id);

  if (!outcome.cancelled) {
    return NextResponse.json(
      { announcementId: id, status: outcome.currentStatus, cancelled: false },
      { status: 409 }
    );
  }

  await logAdminAction({
    actor: adminCheck.session,
    action: "announcement.cancel",
    targetType: "Announcement",
    targetId: id,
    metadata: { previousStatus: existing.status, newStatus: "CANCELLED" },
  });

  return NextResponse.json({ announcementId: id, status: "CANCELLED", cancelled: true });
}
