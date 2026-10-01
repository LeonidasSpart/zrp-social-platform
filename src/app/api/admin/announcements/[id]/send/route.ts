import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit-log";
import { prisma } from "@/lib/db";
import { rateLimitByIpAndUser } from "@/lib/rate-limit";
import { beginSending, kickOffBroadcastProcessing } from "@/lib/announcements/dispatch";

/**
 * "SEND TO ALL". This is the one endpoint the whole mission is about,
 * so its safety properties are worth spelling out:
 *
 *  - authenticated + admin-authorized (requireAdmin, DB-fresh - see
 *    src/lib/admin.ts): never trusts the frontend, never trusts a
 *    stale JWT role claim.
 *  - rate-limited per admin account AND per IP (rateLimitByIpAndUser).
 *  - idempotent via an atomic status transition (beginSending(), see
 *    dispatch.ts): a double-click, a duplicate HTTP request from a
 *    flaky client retry, or two admins hitting Send on the same
 *    announcement at once can only ever actually start ONE broadcast.
 *    Every other caller gets back the announcement's real current
 *    state instead of a second broadcast silently starting.
 *  - never holds the HTTP request open for the fan-out: the actual
 *    batch processing is handed off to kickOffBroadcastProcessing()
 *    (fire-and-forget, see dispatch.ts for why that's safe here) and
 *    this handler returns a QUEUED-style response immediately,
 *    regardless of whether the audience is 100 users or 1,000,000.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const limited = await rateLimitByIpAndUser(req, adminCheck.session.user.id, {
    limit: 10,
    window: 3600,
    type: "admin-announcement-send",
  });
  if (!limited.success) return limited.response;

  const { id } = await params;
  const existing = await prisma.announcement.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Announcement not found" }, { status: 404 });

  const outcome = await beginSending(id);

  if (!outcome.started) {
    // Not an error - the announcement simply isn't in a sendable state
    // (already sending/sent/cancelled, or this IS the duplicate
    // request). Report its real current status rather than pretending
    // a new send just happened.
    return NextResponse.json(
      { announcementId: id, status: outcome.currentStatus, alreadyInProgress: true },
      { status: 200 }
    );
  }

  await logAdminAction({
    actor: adminCheck.session,
    action: "announcement.send",
    targetType: "Announcement",
    targetId: id,
    metadata: { previousStatus: "DRAFT_OR_SCHEDULED", newStatus: "SENDING", totalRecipients: outcome.totalRecipients },
  });

  kickOffBroadcastProcessing(id);

  return NextResponse.json(
    { announcementId: id, status: "SENDING", totalRecipients: outcome.totalRecipients },
    { status: 202 }
  );
}
