export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonWithDecimalStrings } from "@/lib/launchpad/json";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const pool = await prisma.stakingPool.findUnique({
      where: { id },
      include: {
        launchedToken: { select: { id: true, name: true, symbol: true, imageUrl: true, mintAddress: true, decimals: true } },
        creator: { select: { id: true, username: true, name: true, avatarUrl: true } },
      },
    });

    if (!pool) {
      return NextResponse.json({ error: "Staking pool not found." }, { status: 404 });
    }

    return jsonWithDecimalStrings({ pool });
  } catch (error) {
    console.error("Error fetching staking pool:", error);
    return NextResponse.json({ error: "Failed to fetch staking pool" }, { status: 500 });
  }
}
