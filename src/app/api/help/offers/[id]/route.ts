export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { HELP_OFFER_STATUSES, type HelpOfferStatus } from "@/lib/help";

// ─── PUT: organizer triages an offer (acknowledge/fulfil/decline) ───
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  try {
    const offer = await prisma.helpOffer.findUnique({
      where: { id },
      include: { campaign: { select: { organizerId: true } } },
    });
    if (!offer) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    }
    if (offer.campaign.organizerId !== token.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { status } = body;
    if (!status || !(HELP_OFFER_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ error: "A valid status is required." }, { status: 400 });
    }

    const updated = await prisma.helpOffer.update({
      where: { id },
      data: { status: status as HelpOfferStatus },
    });

    return NextResponse.json({ offer: updated });
  } catch (error) {
    console.error("Error updating HELP offer:", error);
    return NextResponse.json({ error: "Failed to update offer" }, { status: 500 });
  }
}
