export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonWithDecimalStrings } from "@/lib/launchpad/json";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const pool = await prisma.farmingPool.findUnique({
      where: { id },
      include: {
        rewardToken: { select: { id: true, name: true, symbol: true, imageUrl: true, mintAddress: true, decimals: true } },
        creator: { select: { id: true, username: true, name: true, avatarUrl: true } },
      },
    });

    if (!pool) {
      return NextResponse.json({ error: "Farming pool not found." }, { status: 404 });
    }

    return jsonWithDecimalStrings({ pool });
  } catch (error) {
    console.error("Error fetching farming pool:", error);
    return NextResponse.json({ error: "Failed to fetch farming pool" }, { status: 500 });
  }
}
