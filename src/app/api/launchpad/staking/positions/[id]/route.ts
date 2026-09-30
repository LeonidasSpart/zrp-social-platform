export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonWithDecimalStrings } from "@/lib/launchpad/json";
import { computeClaimableRewardRaw } from "@/lib/launchpad/staking-service";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const position = await prisma.stakingPosition.findUnique({
      where: { id },
      include: {
        pool: {
          include: { launchedToken: { select: { name: true, symbol: true, decimals: true, imageUrl: true, mintAddress: true } } },
        },
      },
    });

    if (!position) {
      return NextResponse.json({ error: "Staking position not found." }, { status: 404 });
    }

    return jsonWithDecimalStrings({
      position: { ...position, claimableRewardRaw: computeClaimableRewardRaw(position, position.pool).toString() },
    });
  } catch (error) {
    console.error("Error fetching staking position:", error);
    return NextResponse.json({ error: "Failed to fetch staking position" }, { status: 500 });
  }
}
