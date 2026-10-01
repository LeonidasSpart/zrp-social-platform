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

    const nft = await prisma.launchedNft.findUnique({
      where: { mintAddress: mint },
      select: {
        id: true,
        mintAddress: true,
        name: true,
        description: true,
        imageUrl: true,
        collectionName: true,
        attributes: true,
        sellerFeeBasisPoints: true,
        revokeUpdate: true,
        status: true,
        mintTransactionId: true,
        createdAt: true,
        creator: { select: CREATOR_SELECT },
      },
    });

    if (!nft || nft.status !== "COMPLETED") {
      return NextResponse.json({ error: "NFT not found." }, { status: 404 });
    }

    return jsonWithDecimals({ nft });
  } catch (error) {
    console.error("Error fetching launched NFT:", error);
    return NextResponse.json({ error: "Failed to fetch NFT" }, { status: 500 });
  }
}
