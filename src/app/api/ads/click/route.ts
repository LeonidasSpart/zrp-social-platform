export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const limit = await rateLimit(req, { limit: 60, window: 60, type: "ads-click" });
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
      select: { id: true, status: true, bidType: true, bidAmount: true, targetUrl: true, postId: true },
    });
    if (!campaign || campaign.status !== "ACTIVE") {
      return NextResponse.json({ logged: false, redirectUrl: null });
    }

    await prisma.adClick.create({
      data: { campaignId, userId: viewerId || null },
    });

    // Same check-then-update-in-a-transaction approach as the impression
    // route, and the same accepted tradeoff - see the comment there.
    if (campaign.bidType === "CPC") {
      const cost = campaign.bidAmount;
      await prisma.$transaction(async (tx) => {
        const fresh = await tx.adCampaign.findUnique({
          where: { id: campaignId },
          select: { budgetSpent: true, budgetTotal: true },
        });
        if (!fresh) return;
        const newSpent = fresh.budgetSpent + cost;
        await tx.adCampaign.update({
          where: { id: campaignId },
          data: {
            budgetSpent: newSpent,
            ...(newSpent >= fresh.budgetTotal ? { status: "COMPLETED" } : {}),
          },
        });
      });
    }

    // Falls back to the post itself if the advertiser didn't set an
    // external destination - clicking an ad should always go somewhere.
    return NextResponse.json({
      logged: true,
      redirectUrl: campaign.targetUrl || `/post/${campaign.postId}`,
    });
  } catch (error) {
    console.error("Error logging ad click:", error);
    return NextResponse.json({ logged: false, redirectUrl: null });
  }
}
