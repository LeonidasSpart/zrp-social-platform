export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
// ⚠️ See ../route.ts - IdoCampaign's Decimal fields are money-scale
// USDC, not raw base units, so this uses jsonWithDecimals, not
// jsonWithDecimalStrings.
import { jsonWithDecimals } from "@/lib/serialize-decimal";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const campaign = await prisma.idoCampaign.findUnique({
      where: { id },
      include: {
        launchedToken: { select: { id: true, name: true, symbol: true, imageUrl: true, mintAddress: true } },
        creator: { select: { id: true, username: true, name: true, avatarUrl: true } },
        _count: { select: { whitelistApplications: true } },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: "IDO campaign not found." }, { status: 404 });
    }

    return jsonWithDecimals({ campaign });
  } catch (error) {
    console.error("Error fetching IDO campaign:", error);
    return NextResponse.json({ error: "Failed to fetch IDO campaign" }, { status: 500 });
  }
}
