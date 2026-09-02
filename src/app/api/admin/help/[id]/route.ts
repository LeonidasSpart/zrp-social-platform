import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { jsonWithDecimals } from "@/lib/serialize-decimal";
import { logAdminAction } from "@/lib/audit-log";
import { createNotification } from "@/lib/notifications";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const adminCheck = await requireStaff();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const { action, rejectionReason } = await req.json();

    if (action !== "approve" && action !== "reject" && action !== "remove") {
      return NextResponse.json({ error: 'action must be "approve", "reject", or "remove"' }, { status: 400 });
    }

    const campaign = await prisma.helpCampaign.findUnique({
      where: { id },
      select: { status: true, organizerId: true },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (action === "remove") {
      if (campaign.status !== "ACTIVE") {
        return NextResponse.json({ error: "Only active campaigns can be removed." }, { status: 400 });
      }
    } else if (campaign.status !== "PENDING_REVIEW") {
      return NextResponse.json(
        { error: "Only campaigns pending review can be approved or rejected." },
        { status: 400 }
      );
    }

    const newStatus = action === "approve" ? "ACTIVE" : action === "reject" ? "REJECTED" : "REMOVED";

    const updated = await prisma.helpCampaign.update({
      where: { id },
      data: {
        status: newStatus,
        rejectionReason: action !== "approve" ? rejectionReason || null : null,
        reviewedBy: adminCheck.session.user.id,
        reviewedAt: new Date(),
      },
    });

    await logAdminAction({
      actor: adminCheck.session,
      action: `help_campaign.${action}`,
      targetType: "HelpCampaign",
      targetId: id,
      metadata: { rejectionReason: rejectionReason || null },
    });

    await createNotification({
      userId: campaign.organizerId,
      type:
        action === "approve"
          ? "help_campaign_approved"
          : action === "reject"
            ? "help_campaign_rejected"
            : "help_campaign_removed",
      fromUserId: adminCheck.session.user.id,
      campaignId: id,
    });

    return jsonWithDecimals({ campaign: updated });
  } catch (error) {
    console.error("Error reviewing HELP campaign:", error);
    return NextResponse.json({ error: "Failed to review campaign" }, { status: 500 });
  }
}
