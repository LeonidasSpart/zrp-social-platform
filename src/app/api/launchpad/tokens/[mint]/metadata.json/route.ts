export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/*
 * Public, unauthenticated - this is the off-chain metadata JSON document
 * the on-chain Metaplex metadata account's `uri` field points at (see
 * src/lib/launchpad/metaplex-metadata.ts). Served dynamically from the
 * LaunchedToken row rather than a separately pinned/stored blob, so
 * there's nothing that can drift out of sync with the row itself - see
 * the Phase 1 plan's "Data model" section for the reasoning.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;

  const token = await prisma.launchedToken.findUnique({
    where: { mintAddress: mint },
    select: {
      name: true,
      symbol: true,
      description: true,
      imageUrl: true,
      website: true,
      twitter: true,
      telegram: true,
      discord: true,
    },
  });

  if (!token) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({
    name: token.name,
    symbol: token.symbol,
    description: token.description ?? "",
    image: token.imageUrl,
    external_url: token.website ?? undefined,
    properties: {
      files: [{ uri: token.imageUrl, type: "image/png" }],
      category: "image",
    },
    extensions: {
      website: token.website ?? undefined,
      twitter: token.twitter ?? undefined,
      telegram: token.telegram ?? undefined,
      discord: token.discord ?? undefined,
    },
  });
}
