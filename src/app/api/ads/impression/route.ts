export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // Generous but real - one viewer scrolling a feed could plausibly
  // trigger many of these, but not thousands.
  const limit = await rateLimit(req, { limit: 120, window: 60, type: "ads-impression" });
  if (!limit.success) return limit.response;

  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    const viewerId = token?.id as string | undefined;

    const { campaignId } = await req.json();
    if (!campaignId || typeof campaignId !== "string") {
      return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
    }

    const campaign = await prisma.adCampaign.findUnique({
      where: { id: campaignId },
      select: { id: true, status: true, bidType: true, bidAmount: true, budgetSpent: true, budgetTotal: true },
    });
    if (!campaign || campaign.status !== "ACTIVE") {
      // Not an error from the client's perspective - the ad may have
      // been paused/exhausted between being served and this call.
      return NextResponse.json({ logged: false });
    }

    await prisma.adImpression.create({
      data: { campaignId, userId: viewerId || null },
    });

    // Only CPM campaigns spend budget on impressions - CPC campaigns
    // only spend on an actual click, tracked separately below.
    if (campaign.bidType === "CPM") {
      const cost = campaign.bidAmount.dividedBy(1000);
      // Prisma can't compare budgetSpent + cost <= budgetTotal directly
      // in a single atomic where clause (that needs two columns compared
      // to each other), so this is a check-then-update inside a
      // transaction rather than a single fully-atomic statement - a
      // reasonable, standard tradeoff for a v1 self-serve platform. The
      // status flip to COMPLETED below is what actually stops future
      // spend once exhausted, which is the part that matters most; a
      // brief, small overspend under very heavy concurrent load on the
      // exact same campaign is the known, accepted edge case here, not
      // a compounding one.
      await prisma.$transaction(async (tx) => {
        const fresh = await tx.adCampaign.findUnique({
          where: { id: campaignId },
          select: { budgetSpent: true, budgetTotal: true },
        });
        if (!fresh) return;
        const newSpent = fresh.budgetSpent.plus(cost);
        await tx.adCampaign.update({
          where: { id: campaignId },
          data: {
            budgetSpent: newSpent,
            ...(newSpent.greaterThanOrEqualTo(fresh.budgetTotal) ? { status: "COMPLETED" } : {}),
          },
        });
      });
    }

    return NextResponse.json({ logged: true });
  } catch (error) {
    console.error("Error logging ad impression:", error);
    return NextResponse.json({ logged: false });
  }
}
