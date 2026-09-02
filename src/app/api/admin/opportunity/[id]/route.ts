import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin";
import { prisma } from "@/lib/db";
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

    const listing = await prisma.opportunityListing.findUnique({
      where: { id },
      select: { status: true, posterId: true },
    });
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    if (action === "remove") {
      if (listing.status !== "ACTIVE") {
        return NextResponse.json({ error: "Only active listings can be removed." }, { status: 400 });
      }
    } else if (listing.status !== "PENDING_REVIEW") {
      return NextResponse.json(
        { error: "Only listings pending review can be approved or rejected." },
        { status: 400 }
      );
    }

    const newStatus = action === "approve" ? "ACTIVE" : action === "reject" ? "REJECTED" : "REMOVED";

    const updated = await prisma.opportunityListing.update({
      where: { id },
      data: {
        status: newStatus,
        rejectionReason: action !== "approve" ? rejectionReason || null : null,
        reviewedBy: adminCheck.session.user.id,
        reviewedAt: new Date(),
        // A fresh approval gets a new 90-day expiry window, same as
        // Listing (ZRP Market Plus).
        ...(action === "approve" ? { expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) } : {}),
      },
    });

    await logAdminAction({
      actor: adminCheck.session,
      action: `opportunity.${action}`,
      targetType: "OpportunityListing",
      targetId: id,
      metadata: { rejectionReason: rejectionReason || null },
    });

    await createNotification({
      userId: listing.posterId,
      type:
        action === "approve"
          ? "opportunity_listing_approved"
          : action === "reject"
            ? "opportunity_listing_rejected"
            : "opportunity_listing_removed",
      fromUserId: adminCheck.session.user.id,
      opportunityId: id,
    });

    return NextResponse.json({ listing: updated });
  } catch (error) {
    console.error("Error reviewing opportunity listing:", error);
    return NextResponse.json({ error: "Failed to review listing" }, { status: 500 });
  }
}
