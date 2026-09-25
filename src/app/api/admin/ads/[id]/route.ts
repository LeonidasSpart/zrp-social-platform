import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin";
// ⚠️ SECURITY: getVerifiedToken is a drop-in for getToken() that overlays the
// database's current role/isAdmin/plan/banned onto the decoded JWT and
// returns null for a banned or deleted account - see src/lib/auth-guards.ts.
import { getVerifiedToken as getToken } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { jsonWithDecimals } from "@/lib/serialize-decimal";
import { logAdminAction } from "@/lib/audit-log";
import { canTransition } from "@/lib/ads/lifecycle";
import type { AdCampaignStatus } from "@prisma/client";

type StatusAction = "approve" | "reject" | "suspend" | "resume" | "cancel";
// "note" is a status-preserving action: it lets staff save the internal
// adminNote without needing to also perform a lifecycle transition (the
// admin queue's note field is editable independent of approve/reject/
// suspend/resume/cancel, and must not silently no-op when nothing else
// changed - see the admin ads page's "Save note" button).
type Action = StatusAction | "note";

// Maps each status-changing admin action to the status it moves a
// campaign TO. The FROM side is whatever the campaign's current status
// actually is - validity of that specific from->to pair is checked
// against the single shared lifecycle map in @/lib/ads/lifecycle, not
// hand-rolled per action here.
const TARGET_STATUS: Record<StatusAction, AdCampaignStatus> = {
  approve: "PAYMENT_PENDING",
  reject: "REJECTED",
  suspend: "SUSPENDED",
  resume: "ACTIVE",
  cancel: "CANCELLED",
};

const VALID_ACTIONS: Action[] = ["approve", "reject", "suspend", "resume", "cancel", "note"];

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const check = await requireStaff();

  if (!check.authorized) {
    return check.response;
  }

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  try {
    const body = await req.json();
    const { action, rejectionReason, adminNote } = body as {
      action?: string;
      rejectionReason?: string;
      adminNote?: string;
    };

    if (!action || !VALID_ACTIONS.includes(action as Action)) {
      return NextResponse.json(
        { error: 'action must be one of "approve", "reject", "suspend", "resume", "cancel", "note"' },
        { status: 400 }
      );
    }

    const campaign = await prisma.adCampaign.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    const isNoteOnly = action === "note";
    const nextStatus = isNoteOnly ? campaign.status : TARGET_STATUS[action as StatusAction];

    // ⚠️ SECURITY: the ONLY source of truth for which admin action is
    // legal from the campaign's current status is this shared lifecycle
    // map - never re-derive from/to validity inline here, or the web
    // admin UI and any future admin surface (native, CLI) can silently
    // drift apart on what's actually allowed. "note" never changes
    // status, so it has nothing to validate against the lifecycle map.
    if (!isNoteOnly && !canTransition("staff", campaign.status, nextStatus)) {
      return NextResponse.json(
        { error: `Cannot ${action} a campaign in ${campaign.status} status.` },
        { status: 400 }
      );
    }

    // Compare-and-swap on the status validated above: the advertiser
    // (cancel/pause), the payment flow and the completion cron all move
    // this row too. A plain update(where: {id}) let e.g. an "approve"
    // resurrect a campaign the advertiser had just CANCELLED, or a
    // "resume" reopen one the cron had just COMPLETED - transitions the
    // lifecycle map never allows.
    const claimed = await prisma.adCampaign.updateMany({
      where: { id, status: campaign.status },
      data: {
        ...(isNoteOnly ? {} : { status: nextStatus }),
        // rejectionReason/suspend-reason share one advertiser-visible
        // field, matching the dashboard's existing display for it;
        // approving/resuming clears it since it no longer applies. A
        // plain note-save never touches it.
        ...(isNoteOnly
          ? {}
          : {
              rejectionReason:
                action === "reject" || action === "suspend" || action === "cancel"
                  ? (typeof rejectionReason === "string" && rejectionReason ? rejectionReason.slice(0, 2000) : null)
                  : null,
            }),
        // adminNote is staff-only - never returned on any advertiser
        // route (/api/ads/campaigns/*).
        ...(typeof adminNote === "string" ? { adminNote: adminNote.slice(0, 2000) || null } : {}),
        reviewedBy: token?.id as string | undefined,
        reviewedAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      return NextResponse.json(
        { error: "This campaign changed status while you were reviewing it. Reload and try again." },
        { status: 409 }
      );
    }
    const updated = await prisma.adCampaign.findUniqueOrThrow({ where: { id } });

    await logAdminAction({
      actor: check.session,
      action: `ad_campaign.${action}`,
      targetType: "AdCampaign",
      targetId: id,
      metadata: { rejectionReason: rejectionReason || null, fromStatus: campaign.status, toStatus: nextStatus },
    });

    return jsonWithDecimals({ campaign: updated });
  } catch (error) {
    console.error("Error reviewing ad campaign:", error);

    return NextResponse.json(
      { error: "Failed to review campaign" },
      { status: 500 }
    );
  }
}
