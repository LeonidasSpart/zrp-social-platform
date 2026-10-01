import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit-log";
import { prisma } from "@/lib/db";
import { validateTrustedUploadUrls } from "@/lib/media-url";
import { validateAnnouncementContent } from "@/lib/announcements/types";

// Status + progress for a single announcement - doubles as the
// "broadcast status" view the mission asks for (totals, processed
// count, start/completion timestamps). No separate GET .../status
// endpoint: this route already returns the full row, so a second
// endpoint returning a subset of the same fields would be redundant.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const { id } = await params;
  const announcement = await prisma.announcement.findUnique({ where: { id } });
  if (!announcement) return NextResponse.json({ error: "Announcement not found" }, { status: 404 });

  return NextResponse.json(announcement);
}

// Editing is only meaningful before anything has gone out - once an
// announcement is SENDING or further, its content is what was (or is
// being) delivered, and silently changing it afterward would make the
// notification center/push payload already sent inconsistent with the
// stored row forever after. DRAFT and SCHEDULED are the only editable
// states.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const { id } = await params;
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
  if (existing.status !== "DRAFT" && existing.status !== "SCHEDULED") {
    return NextResponse.json(
      { error: `Cannot edit an announcement in status ${existing.status}` },
      { status: 409 }
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validated = validateAnnouncementContent({
    title: payload.title ?? existing.title,
    body: payload.body ?? existing.body,
    type: payload.type ?? existing.type,
    imageUrl: payload.imageUrl !== undefined ? payload.imageUrl : existing.imageUrl,
    actionUrl: payload.actionUrl !== undefined ? payload.actionUrl : existing.actionUrl,
    scheduledAt: payload.scheduledAt !== undefined ? payload.scheduledAt : existing.scheduledAt,
  });
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  if (validated.value.imageUrl) {
    const imageCheck = validateTrustedUploadUrls([validated.value.imageUrl], {
      allowExisting: [existing.imageUrl],
    });
    if (!imageCheck.ok) {
      return NextResponse.json({ error: imageCheck.error }, { status: 400 });
    }
  }

  const updated = await prisma.announcement.update({
    where: { id },
    data: {
      title: validated.value.title,
      body: validated.value.body,
      type: validated.value.type,
      imageUrl: validated.value.imageUrl,
      actionUrl: validated.value.actionUrl,
      scheduledAt: validated.value.scheduledAt,
      status: validated.value.scheduledAt ? "SCHEDULED" : "DRAFT",
    },
  });

  await logAdminAction({
    actor: adminCheck.session,
    action: "announcement.edit",
    targetType: "Announcement",
    targetId: id,
    metadata: { previousStatus: existing.status, newStatus: updated.status },
  });

  return NextResponse.json(updated);
}
