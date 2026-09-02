export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isSessionAdmin } from "@/lib/admin";
import { OPPORTUNITY_TYPES, type OpportunityType } from "@/lib/opportunity";

const POSTER_SELECT = {
  id: true,
  username: true,
  name: true,
  avatarUrl: true,
  badgeType: true,
} as const;

// ─── GET: fetch a single opportunity listing ─────────────────────────
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const listing = await prisma.opportunityListing.findUnique({
      where: { id },
      include: { poster: { select: POSTER_SELECT }, _count: { select: { applications: true } } },
    });
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const session = await getServerSession(authOptions);
    const isOwner = session?.user?.id === listing.posterId;
    const isStaff = isOwner ? false : await isSessionAdmin(session);

    if (listing.status !== "ACTIVE" && !isOwner && !isStaff) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    if (listing.status === "ACTIVE" && !isOwner) {
      prisma.opportunityListing.update({ where: { id }, data: { views: { increment: 1 } } }).catch((err) => {
        console.error("Error incrementing opportunity view count:", err);
      });
    }

    return NextResponse.json({ listing });
  } catch (error) {
    console.error("Error fetching opportunity listing:", error);
    return NextResponse.json({ error: "Failed to fetch listing" }, { status: 500 });
  }
}

// ─── PUT: poster edits their listing ─────────────────────────────────
// A substantive edit to a live listing bounces it back to
// PENDING_REVIEW, same bait-and-switch prevention as Listing.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const existing = await prisma.opportunityListing.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const isOwner = existing.posterId === session.user.id;
    const isStaff = isOwner ? false : await isSessionAdmin(session);
    if (!isOwner && !isStaff) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const {
      type,
      title,
      description,
      organizationName,
      skills,
      location,
      remote,
      isPaid,
      compensationInfo,
      externalUrl,
      deadline,
      status,
    } = body;

    if (type && !(OPPORTUNITY_TYPES as readonly string[]).includes(type)) {
      return NextResponse.json({ error: "Invalid opportunity type." }, { status: 400 });
    }
    if (title !== undefined && (typeof title !== "string" || !title.trim() || title.trim().length > 150)) {
      return NextResponse.json({ error: "Title is required (max 150 characters)." }, { status: 400 });
    }
    if (
      description !== undefined &&
      (typeof description !== "string" || !description.trim() || description.trim().length > 8000)
    ) {
      return NextResponse.json({ error: "Description is required (max 8000 characters)." }, { status: 400 });
    }

    const cleanSkills = Array.isArray(skills)
      ? skills
          .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
          .map((s) => s.trim().toLowerCase().slice(0, 40))
          .slice(0, 20)
      : undefined;

    let cleanDeadline: Date | null | undefined = undefined;
    if (deadline !== undefined) {
      if (deadline === null) {
        cleanDeadline = null;
      } else {
        const d = new Date(deadline);
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json({ error: "Invalid deadline." }, { status: 400 });
        }
        cleanDeadline = d;
      }
    }

    const substantiveChange =
      (type && type !== existing.type) ||
      (title && title.trim() !== existing.title) ||
      (description && description.trim() !== existing.description) ||
      (compensationInfo !== undefined && compensationInfo !== existing.compensationInfo);

    // Only the owner closing/reopening their own listing, or staff
    // acting on it, may set status directly; anything else routes
    // through the substantive-edit re-review logic below.
    const nextStatus =
      isOwner && status === "CLOSED" && existing.status === "ACTIVE"
        ? "CLOSED"
        : existing.status === "ACTIVE" && substantiveChange
          ? "PENDING_REVIEW"
          : existing.status;

    const listing = await prisma.opportunityListing.update({
      where: { id },
      data: {
        ...(type ? { type: type as OpportunityType } : {}),
        ...(title ? { title: title.trim() } : {}),
        ...(description ? { description: description.trim() } : {}),
        ...(organizationName !== undefined
          ? { organizationName: typeof organizationName === "string" ? organizationName.trim().slice(0, 150) || null : null }
          : {}),
        ...(cleanSkills !== undefined ? { skills: cleanSkills } : {}),
        ...(location !== undefined ? { location: typeof location === "string" ? location.trim().slice(0, 150) || null : null } : {}),
        ...(remote !== undefined ? { remote: Boolean(remote) } : {}),
        ...(isPaid !== undefined ? { isPaid: Boolean(isPaid) } : {}),
        ...(compensationInfo !== undefined
          ? { compensationInfo: typeof compensationInfo === "string" ? compensationInfo.trim().slice(0, 200) || null : null }
          : {}),
        ...(externalUrl !== undefined
          ? { externalUrl: typeof externalUrl === "string" ? externalUrl.trim().slice(0, 500) || null : null }
          : {}),
        ...(cleanDeadline !== undefined ? { deadline: cleanDeadline } : {}),
        status: nextStatus,
        ...(nextStatus === "PENDING_REVIEW" ? { rejectionReason: null, reviewedBy: null, reviewedAt: null } : {}),
      },
    });

    return NextResponse.json({ listing });
  } catch (error) {
    console.error("Error updating opportunity listing:", error);
    return NextResponse.json({ error: "Failed to update listing" }, { status: 500 });
  }
}

// ─── DELETE: poster or staff removes the listing ─────────────────────
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const existing = await prisma.opportunityListing.findUnique({ where: { id }, select: { posterId: true } });
    if (!existing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const isOwner = existing.posterId === session.user.id;
    const isStaff = isOwner ? false : await isSessionAdmin(session);
    if (!isOwner && !isStaff) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.opportunityListing.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting opportunity listing:", error);
    return NextResponse.json({ error: "Failed to delete listing" }, { status: 500 });
  }
}
