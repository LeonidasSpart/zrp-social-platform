export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { createNotification } from "@/lib/notifications";

// ─── POST: apply to an in-platform opportunity listing ──────────────
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limit = await rateLimit(req, { limit: 20, window: 3600, type: "opportunity-apply" });
  if (!limit.success) return limit.response;

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const applicantId = token.id as string;

  const { id: listingId } = await params;

  try {
    const listing = await prisma.opportunityListing.findUnique({ where: { id: listingId } });
    if (!listing || listing.status !== "ACTIVE") {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    if (listing.externalUrl) {
      return NextResponse.json(
        { error: "This listing accepts applications through an external link." },
        { status: 400 }
      );
    }
    if (listing.posterId === applicantId) {
      return NextResponse.json({ error: "You can't apply to your own listing." }, { status: 400 });
    }

    const existing = await prisma.opportunityApplication.findUnique({
      where: { listingId_applicantId: { listingId, applicantId } },
    });
    if (existing) {
      return NextResponse.json({ error: "You've already applied to this listing." }, { status: 400 });
    }

    const body = await req.json();
    const { coverNote, resumeUrl } = body;

    if (coverNote !== undefined && (typeof coverNote !== "string" || coverNote.length > 3000)) {
      return NextResponse.json({ error: "Cover note is too long (max 3000 characters)." }, { status: 400 });
    }
    if (resumeUrl !== undefined && typeof resumeUrl !== "string") {
      return NextResponse.json({ error: "Invalid resume URL." }, { status: 400 });
    }

    const application = await prisma.opportunityApplication.create({
      data: {
        listingId,
        applicantId,
        coverNote: typeof coverNote === "string" ? coverNote.trim().slice(0, 3000) || null : null,
        resumeUrl: typeof resumeUrl === "string" ? resumeUrl.trim().slice(0, 500) || null : null,
      },
    });

    await createNotification({
      userId: listing.posterId,
      type: "opportunity_new_application",
      fromUserId: applicantId,
      opportunityId: listingId,
    });

    return NextResponse.json({ application }, { status: 201 });
  } catch (error) {
    console.error("Error applying to opportunity:", error);
    return NextResponse.json({ error: "Failed to submit application" }, { status: 500 });
  }
}
