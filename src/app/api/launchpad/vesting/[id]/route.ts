export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonWithDecimalStrings as jsonWithDecimals } from "@/lib/launchpad/json";
import { computeClaimableRaw } from "@/lib/launchpad/vesting-service";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const contract = await prisma.vestingContract.findUnique({
      where: { id },
      include: {
        launchedToken: { select: { id: true, name: true, symbol: true, imageUrl: true, mintAddress: true, decimals: true } },
        creator: { select: { id: true, username: true, name: true, avatarUrl: true } },
      },
    });

    if (!contract) {
      return NextResponse.json({ error: "Vesting contract not found." }, { status: 404 });
    }

    return jsonWithDecimals({ contract: { ...contract, claimableRaw: computeClaimableRaw(contract).toString() } });
  } catch (error) {
    console.error("Error fetching vesting contract:", error);
    return NextResponse.json({ error: "Failed to fetch vesting contract" }, { status: 500 });
  }
}
