export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/opportunity";

// ─── PUT: poster reviews/accepts/rejects, or applicant withdraws ────
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = token.id as string;
  const { id } = await params;

  try {
    const application = await prisma.opportunityApplication.findUnique({
      where: { id },
      include: { listing: { select: { posterId: true } } },
    });
    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const isPoster = application.listing.posterId === userId;
    const isApplicant = application.applicantId === userId;
    if (!isPoster && !isApplicant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { status } = body;
    if (!status || !(APPLICATION_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ error: "A valid status is required." }, { status: 400 });
    }

    if (isApplicant && status !== "WITHDRAWN") {
      return NextResponse.json({ error: "You can only withdraw your own application." }, { status: 403 });
    }
    if (isPoster && !["REVIEWED", "ACCEPTED", "REJECTED"].includes(status)) {
      return NextResponse.json({ error: "Invalid status for the listing owner." }, { status: 403 });
    }

    const updated = await prisma.opportunityApplication.update({
      where: { id },
      data: { status: status as ApplicationStatus },
    });

    if (isPoster && (status === "ACCEPTED" || status === "REJECTED")) {
      await createNotification({
        userId: application.applicantId,
        type: status === "ACCEPTED" ? "opportunity_application_accepted" : "opportunity_application_rejected",
        fromUserId: userId,
        opportunityId: application.listingId,
      });
    }

    return NextResponse.json({ application: updated });
  } catch (error) {
    console.error("Error updating opportunity application:", error);
    return NextResponse.json({ error: "Failed to update application" }, { status: 500 });
  }
}
