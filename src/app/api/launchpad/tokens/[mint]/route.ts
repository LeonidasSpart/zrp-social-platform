export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonWithDecimalStrings as jsonWithDecimals } from "@/lib/launchpad/json";

const CREATOR_SELECT = {
  id: true,
  username: true,
  name: true,
  avatarUrl: true,
  badgeType: true,
} as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ mint: string }> }) {
  try {
    const { mint } = await params;

    const token = await prisma.launchedToken.findUnique({
      where: { mintAddress: mint },
      select: {
        id: true,
        mintAddress: true,
        venue: true,
        name: true,
        symbol: true,
        description: true,
        imageUrl: true,
        website: true,
        twitter: true,
        telegram: true,
        discord: true,
        supply: true,
        decimals: true,
        revokeMint: true,
        revokeFreeze: true,
        revokeUpdate: true,
        status: true,
        mintTransactionId: true,
        createdAt: true,
        creator: { select: CREATOR_SELECT },
      },
    });

    if (!token || token.status !== "COMPLETED") {
      return NextResponse.json({ error: "Token not found." }, { status: 404 });
    }

    return jsonWithDecimals({ token });
  } catch (error) {
    console.error("Error fetching launched token:", error);
    return NextResponse.json({ error: "Failed to fetch token" }, { status: 500 });
  }
}
