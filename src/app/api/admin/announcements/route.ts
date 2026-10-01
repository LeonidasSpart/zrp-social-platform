import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit-log";
import { prisma } from "@/lib/db";
import { rateLimitByIpAndUser } from "@/lib/rate-limit";
import { validateTrustedUploadUrls } from "@/lib/media-url";
import { validateAnnouncementContent } from "@/lib/announcements/types";
import { ANNOUNCEMENT_STATUSES, isValidAnnouncementStatus } from "@/lib/announcements/status";

// Global announcements are a full-ADMIN action, not requireStaff
// (ADMIN or MODERATOR) - this is a platform-wide broadcast to every
// eligible member, a materially higher blast radius than the
// moderation-queue actions requireStaff normally gates (ad review,
// reports, etc). Moderators do not get this capability unless the
// existing Role enum is changed to explicitly grant it - see
// prisma/schema.prisma's `enum Role`.
export async function POST(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const limited = await rateLimitByIpAndUser(req, adminCheck.session.user.id, {
    limit: 20,
    window: 3600,
    type: "admin-announcement-create",
  });
  if (!limited.success) return limited.response;

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validated = validateAnnouncementContent(payload);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  if (validated.value.imageUrl) {
    // Broadcast images come from ZRP's own upload storage only - same
    // UploadThing-only rule already applied to stories/marketplace
    // media, not an arbitrary external image URL.
    const imageCheck = validateTrustedUploadUrls([validated.value.imageUrl]);
    if (!imageCheck.ok) {
      return NextResponse.json({ error: imageCheck.error }, { status: 400 });
    }
  }

  const announcement = await prisma.announcement.create({
    data: {
      title: validated.value.title,
      body: validated.value.body,
      type: validated.value.type,
      imageUrl: validated.value.imageUrl,
      actionUrl: validated.value.actionUrl,
      scheduledAt: validated.value.scheduledAt,
      status: validated.value.scheduledAt ? "SCHEDULED" : "DRAFT",
      createdById: adminCheck.session.user.id,
    },
  });

  await logAdminAction({
    actor: adminCheck.session,
    action: "announcement.create",
    targetType: "Announcement",
    targetId: announcement.id,
    metadata: { status: announcement.status, type: announcement.type, scheduledAt: announcement.scheduledAt },
  });

  return NextResponse.json(announcement, { status: 201 });
}

// Broadcast history - newest first, paginated like the other admin list
// endpoints in this codebase (src/app/api/admin/ads/route.ts).
export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const statusParam = req.nextUrl.searchParams.get("status");
  if (statusParam && !isValidAnnouncementStatus(statusParam)) {
    return NextResponse.json({ error: `status must be one of: ${ANNOUNCEMENT_STATUSES.join(", ")}` }, { status: 400 });
  }
  const validatedStatus = statusParam && isValidAnnouncementStatus(statusParam) ? statusParam : null;
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") || "20", 10) || 20));

  const where = validatedStatus ? { status: validatedStatus } : {};

  const [announcements, total] = await Promise.all([
    prisma.announcement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.announcement.count({ where }),
  ]);

  return NextResponse.json({ announcements, total, page, totalPages: Math.ceil(total / limit) });
}
