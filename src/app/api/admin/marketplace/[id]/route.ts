import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { jsonWithDecimals } from "@/lib/serialize-decimal";
import { logAdminAction } from "@/lib/audit-log";
import { createNotification } from "@/lib/notifications";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const adminCheck = await requireStaff();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const { action, rejectionReason } = await req.json();

    if (action !== "approve" && action !== "reject" && action !== "remove") {
      return NextResponse.json(
        { error: 'action must be "approve", "reject", or "remove"' },
        { status: 400 }
      );
    }

    const listing = await prisma.listing.findUnique({
      where: { id },
      select: { status: true, sellerId: true },
    });
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    if (action === "remove") {
      // Removing an already-live listing for a policy violation - the
      // only one of the three actions not gated on PENDING_REVIEW,
      // since a listing has to be ACTIVE first to need removing.
      if (listing.status !== "ACTIVE") {
        return NextResponse.json(
          { error: "Only active listings can be removed." },
          { status: 400 }
        );
      }
    } else if (listing.status !== "PENDING_REVIEW") {
      return NextResponse.json(
        { error: "Only listings pending review can be approved or rejected." },
        { status: 400 }
      );
    }

    const newStatus = action === "approve" ? "ACTIVE" : action === "reject" ? "REJECTED" : "REMOVED";

    const updated = await prisma.listing.update({
      where: { id },
      data: {
        status: newStatus,
        rejectionReason: action !== "approve" ? rejectionReason || null : null,
        reviewedBy: adminCheck.session.user.id,
        reviewedAt: new Date(),
        // A fresh approval gets a new 90-day expiry window.
        ...(action === "approve"
          ? { expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) }
          : {}),
      },
    });

    await logAdminAction({
      actor: adminCheck.session,
      action: `listing.${action}`,
      targetType: "Listing",
      targetId: id,
      metadata: { rejectionReason: rejectionReason || null },
    });

    await createNotification({
      userId: listing.sellerId,
      type:
        action === "approve"
          ? "listing_approved"
          : action === "reject"
            ? "listing_rejected"
            : "listing_removed",
      fromUserId: adminCheck.session.user.id,
      listingId: id,
    });

    return jsonWithDecimals({ listing: updated });
  } catch (error) {
    console.error("Error reviewing listing:", error);
    return NextResponse.json({ error: "Failed to review listing" }, { status: 500 });
  }
}
