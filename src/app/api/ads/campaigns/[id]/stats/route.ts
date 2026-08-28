export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const campaign = await prisma.adCampaign.findUnique({
      where: { id: params.id },
      select: {
        advertiserId: true,
        status: true,
        bidType: true,
        bidAmount: true,
        budgetTotal: true,
        budgetSpent: true,
      },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (campaign.advertiserId !== token.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const since = new Date();
    since.setDate(since.getDate() - 30);

    // Independent queries (none depends on another's result), run
    // concurrently rather than sequentially - same pattern already
    // established elsewhere in this app's high-traffic routes.
    const [totalImpressions, totalClicks, recentImpressions, recentClicks] = await Promise.all([
      prisma.adImpression.count({ where: { campaignId: params.id } }),
      prisma.adClick.count({ where: { campaignId: params.id } }),
      prisma.adImpression.findMany({
        where: { campaignId: params.id, createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      prisma.adClick.findMany({
        where: { campaignId: params.id, createdAt: { gte: since } },
        select: { createdAt: true },
      }),
    ]);

    // ─── Aggregate impressions/clicks per day for the last 30 days ────
    const dailyImpressions: Record<string, number> = {};
    const dailyClicks: Record<string, number> = {};
    recentImpressions.forEach((i) => {
      const day = i.createdAt.toISOString().slice(0, 10);
      dailyImpressions[day] = (dailyImpressions[day] || 0) + 1;
    });
    recentClicks.forEach((c) => {
      const day = c.createdAt.toISOString().slice(0, 10);
      dailyClicks[day] = (dailyClicks[day] || 0) + 1;
    });

    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

    const budgetSpent = campaign.budgetSpent.toNumber();
    const budgetTotal = campaign.budgetTotal.toNumber();

    return NextResponse.json({
      totalImpressions,
      totalClicks,
      ctr: Math.round(ctr * 100) / 100,
      budgetSpent,
      budgetTotal,
      budgetRemaining: Math.max(0, budgetTotal - budgetSpent),
      status: campaign.status,
      dailyImpressions,
      dailyClicks,
    });
  } catch (error) {
    console.error("Error fetching campaign stats:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
