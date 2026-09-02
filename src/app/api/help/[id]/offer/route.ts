export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { createNotification } from "@/lib/notifications";
import { HELP_NEED_TYPES, type HelpNeedType } from "@/lib/help";

// ─── POST: offer non-monetary help (supplies/skills/volunteers) ─────
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limit = await rateLimit(req, { limit: 20, window: 3600, type: "help-offer" });
  if (!limit.success) return limit.response;

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const offererId = token.id as string;
  const { id: campaignId } = await params;

  try {
    const campaign = await prisma.helpCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.status !== "ACTIVE") {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (campaign.organizerId === offererId) {
      return NextResponse.json({ error: "You can't offer help on your own campaign." }, { status: 400 });
    }

    const body = await req.json();
    const { needType, message } = body;

    const validOfferTypes: HelpNeedType[] = ["SUPPLIES", "SKILLS", "VOLUNTEERS"];
    if (!needType || !(HELP_NEED_TYPES as readonly string[]).includes(needType) || !validOfferTypes.includes(needType)) {
      return NextResponse.json({ error: "A valid need type (supplies, skills, or volunteers) is required." }, { status: 400 });
    }
    if (!message || typeof message !== "string" || !message.trim() || message.trim().length > 1000) {
      return NextResponse.json({ error: "A message is required (max 1000 characters)." }, { status: 400 });
    }

    const offer = await prisma.helpOffer.create({
      data: {
        campaignId,
        offererId,
        needType: needType as HelpNeedType,
        message: message.trim(),
      },
    });

    await createNotification({
      userId: campaign.organizerId,
      type: "help_new_offer",
      fromUserId: offererId,
      campaignId,
    });

    return NextResponse.json({ offer }, { status: 201 });
  } catch (error) {
    console.error("Error creating HELP offer:", error);
    return NextResponse.json({ error: "Failed to submit offer" }, { status: 500 });
  }
}

// ─── GET: organizer (or staff) reviews offers on their campaign ─────
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: campaignId } = await params;

  try {
    const campaign = await prisma.helpCampaign.findUnique({ where: { id: campaignId }, select: { organizerId: true } });
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (campaign.organizerId !== token.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const offers = await prisma.helpOffer.findMany({
      where: { campaignId },
      orderBy: { createdAt: "desc" },
      include: {
        offerer: { select: { id: true, username: true, name: true, avatarUrl: true, badgeType: true } },
      },
    });

    return NextResponse.json({ offers });
  } catch (error) {
    console.error("Error fetching HELP offers:", error);
    return NextResponse.json({ error: "Failed to fetch offers" }, { status: 500 });
  }
}
