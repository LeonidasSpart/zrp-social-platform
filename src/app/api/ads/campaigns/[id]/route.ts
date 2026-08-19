export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";

// ─── GET: full details + stats for one campaign (owner only) ────────
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const campaign = await prisma.adCampaign.findUnique({
      where: { id: params.id },
      include: {
        post: {
          select: {
            id: true,
            content: true,
            imageUrl: true,
            imageUrls: true,
            mediaType: true,
          },
        },
        _count: { select: { impressions: true, clicks: true } },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (campaign.advertiserId !== token.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    return NextResponse.json({ campaign });
  } catch (error) {
    console.error("Error fetching ad campaign:", error);
    return NextResponse.json({ error: "Failed to fetch campaign" }, { status: 500 });
  }
}

// ─── PUT: pause/resume, or edit budget/dates (owner only) ───────────
export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const existing = await prisma.adCampaign.findUnique({
      where: { id: params.id },
      select: { advertiserId: true, status: true, budgetSpent: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (existing.advertiserId !== token.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const { status, budgetTotal, endDate } = body;
    const data: any = {};

    // Advertisers can only ever pause or resume their own campaign, never
    // set it directly to ACTIVE/REJECTED/COMPLETED themselves - ACTIVE
    // is granted by moderator approval, REJECTED by a moderator, and
    // COMPLETED happens automatically once the budget is exhausted (see
    // the impression/click routes). This matches how a real ad platform
    // keeps the advertiser and the platform's own state transitions
    // separate from each other.
    if (status !== undefined) {
      if (status === "PAUSED" && existing.status === "ACTIVE") {
        data.status = "PAUSED";
      } else if (status === "ACTIVE" && existing.status === "PAUSED") {
        data.status = "ACTIVE";
      } else {
        return NextResponse.json(
          { error: "You can only pause an active campaign or resume a paused one." },
          { status: 400 }
        );
      }
    }

    if (budgetTotal !== undefined) {
      const numericBudget = Number(budgetTotal);
      if (!Number.isFinite(numericBudget) || numericBudget < existing.budgetSpent) {
        return NextResponse.json(
          { error: "New budget can't be less than what's already been spent." },
          { status: 400 }
        );
      }
      data.budgetTotal = numericBudget;
    }

    if (endDate !== undefined) {
      data.endDate = endDate ? new Date(endDate) : null;
    }

    const campaign = await prisma.adCampaign.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json({ campaign });
  } catch (error) {
    console.error("Error updating ad campaign:", error);
    return NextResponse.json({ error: "Failed to update campaign" }, { status: 500 });
  }
}

// ─── DELETE: remove a campaign (owner only) ──────────────────────────
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const existing = await prisma.adCampaign.findUnique({
      where: { id: params.id },
      select: { advertiserId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (existing.advertiserId !== token.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Deleting the campaign cascades to its impressions/clicks (schema
    // onDelete: Cascade) but never touches the underlying post itself -
    // the ad creative is a real post the advertiser still owns.
    await prisma.adCampaign.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting ad campaign:", error);
    return NextResponse.json({ error: "Failed to delete campaign" }, { status: 500 });
  }
}
