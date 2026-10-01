export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/*
 * Public, unauthenticated - the off-chain Metaplex metadata JSON the
 * on-chain metadata account's `uri` field points at. Same
 * served-dynamically-from-the-row shape as the fungible token's own
 * metadata.json route, extended with the `attributes` array the
 * Metaplex NFT standard expects (a plain token has none).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;

  const nft = await prisma.launchedNft.findUnique({
    where: { mintAddress: mint },
    select: {
      name: true,
      description: true,
      imageUrl: true,
      collectionName: true,
      attributes: true,
      sellerFeeBasisPoints: true,
    },
  });

  if (!nft) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({
    name: nft.name,
    description: nft.description ?? "",
    image: nft.imageUrl,
    attributes: nft.attributes ?? [],
    seller_fee_basis_points: nft.sellerFeeBasisPoints,
    properties: {
      files: [{ uri: nft.imageUrl, type: "image/png" }],
      category: "image",
    },
    collection: nft.collectionName ? { name: nft.collectionName, family: nft.collectionName } : undefined,
  });
}
