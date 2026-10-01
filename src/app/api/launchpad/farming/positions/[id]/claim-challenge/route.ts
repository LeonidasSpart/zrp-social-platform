export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { buildWalletLinkMessage, generateWalletLinkNonce } from "@/lib/wallet-link";

/*
 * Public - the same single-use ed25519 challenge pattern as a fungible
 * staking claim, bound to this farming position's id.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limitCheck = await rateLimit(req, { limit: 20, window: 60, type: "farming-claim-challenge" });
    if (!limitCheck.success) return limitCheck.response;

    const { id } = await params;
    const position = await prisma.farmingPosition.findUnique({ where: { id }, select: { id: true } });
    if (!position) {
      return NextResponse.json({ error: "Farming position not found." }, { status: 404 });
    }

    const { nonce, expiresAt } = generateWalletLinkNonce();
    await prisma.farmingPosition.update({
      where: { id },
      data: { claimNonce: nonce, claimNonceExpiresAt: expiresAt },
    });

    return NextResponse.json({ message: buildWalletLinkMessage(id, nonce) });
  } catch (error) {
    console.error("Error issuing farming claim challenge:", error);
    return NextResponse.json({ error: "Failed to issue claim challenge" }, { status: 500 });
  }
}
