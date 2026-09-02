export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isSessionAdmin } from "@/lib/admin";
import { jsonWithDecimals } from "@/lib/serialize-decimal";
import { HELP_CATEGORIES, HELP_NEED_TYPES, type HelpCategory, type HelpNeedType } from "@/lib/help";

const ORGANIZER_SELECT = {
  id: true,
  username: true,
  name: true,
  avatarUrl: true,
  badgeType: true,
} as const;

// ─── GET: fetch a single campaign ────────────────────────────────────
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const campaign = await prisma.helpCampaign.findUnique({
      where: { id },
      include: { organizer: { select: ORGANIZER_SELECT } },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const session = await getServerSession(authOptions);
    const isOwner = session?.user?.id === campaign.organizerId;
    const isStaff = isOwner ? false : await isSessionAdmin(session);

    if (campaign.status !== "ACTIVE" && campaign.status !== "COMPLETED" && !isOwner && !isStaff) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if ((campaign.status === "ACTIVE" || campaign.status === "COMPLETED") && !isOwner) {
      prisma.helpCampaign.update({ where: { id }, data: { views: { increment: 1 } } }).catch((err) => {
        console.error("Error incrementing HELP campaign view count:", err);
      });
    }

    return jsonWithDecimals({ campaign });
  } catch (error) {
    console.error("Error fetching HELP campaign:", error);
    return NextResponse.json({ error: "Failed to fetch campaign" }, { status: 500 });
  }
}

// ─── PUT: organizer edits their campaign ─────────────────────────────
// A substantive edit to a live campaign bounces it back to
// PENDING_REVIEW, same bait-and-switch prevention as Listing.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const existing = await prisma.helpCampaign.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const isOwner = existing.organizerId === session.user.id;
    const isStaff = isOwner ? false : await isSessionAdmin(session);
    if (!isOwner && !isStaff) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { category, needTypes, title, description, location, imageUrls, proofUrls, status } = body;

    if (category && !(HELP_CATEGORIES as readonly string[]).includes(category)) {
      return NextResponse.json({ error: "Invalid category." }, { status: 400 });
    }
    const cleanNeedTypes = Array.isArray(needTypes)
      ? needTypes.filter((n): n is HelpNeedType => (HELP_NEED_TYPES as readonly string[]).includes(n))
      : undefined;
    if (title !== undefined && (typeof title !== "string" || !title.trim() || title.trim().length > 150)) {
      return NextResponse.json({ error: "Title is required (max 150 characters)." }, { status: 400 });
    }
    if (
      description !== undefined &&
      (typeof description !== "string" || !description.trim() || description.trim().length > 8000)
    ) {
      return NextResponse.json({ error: "Description is required (max 8000 characters)." }, { status: 400 });
    }

    const substantiveChange =
      (category && category !== existing.category) ||
      (title && title.trim() !== existing.title) ||
      (description && description.trim() !== existing.description);

    const nextStatus =
      isOwner && status === "CLOSED" && existing.status === "ACTIVE"
        ? "CLOSED"
        : existing.status === "ACTIVE" && substantiveChange
          ? "PENDING_REVIEW"
          : existing.status;

    const campaign = await prisma.helpCampaign.update({
      where: { id },
      data: {
        ...(category ? { category: category as HelpCategory } : {}),
        ...(cleanNeedTypes !== undefined ? { needTypes: cleanNeedTypes } : {}),
        ...(title ? { title: title.trim() } : {}),
        ...(description ? { description: description.trim() } : {}),
        ...(location !== undefined ? { location: typeof location === "string" ? location.trim().slice(0, 150) || null : null } : {}),
        ...(Array.isArray(imageUrls)
          ? { imageUrls: imageUrls.filter((u): u is string => typeof u === "string" && u.trim().length > 0).slice(0, 15) }
          : {}),
        ...(Array.isArray(proofUrls)
          ? { proofUrls: proofUrls.filter((u): u is string => typeof u === "string" && u.trim().length > 0).slice(0, 10) }
          : {}),
        status: nextStatus,
        ...(nextStatus === "PENDING_REVIEW" ? { rejectionReason: null, reviewedBy: null, reviewedAt: null } : {}),
      },
    });

    return jsonWithDecimals({ campaign });
  } catch (error) {
    console.error("Error updating HELP campaign:", error);
    return NextResponse.json({ error: "Failed to update campaign" }, { status: 500 });
  }
}

// ─── DELETE: organizer or staff removes the campaign ─────────────────
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const existing = await prisma.helpCampaign.findUnique({ where: { id }, select: { organizerId: true, balance: true } });
    if (!existing) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const isOwner = existing.organizerId === session.user.id;
    const isStaff = isOwner ? false : await isSessionAdmin(session);
    if (!isOwner && !isStaff) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (existing.balance.greaterThan(0)) {
      return NextResponse.json(
        { error: "This campaign still holds an unwithdrawn balance and can't be deleted. Request a withdrawal first." },
        { status: 400 }
      );
    }

    await prisma.helpCampaign.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting HELP campaign:", error);
    return NextResponse.json({ error: "Failed to delete campaign" }, { status: 500 });
  }
}
