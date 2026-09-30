export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { buildWalletLinkMessage, generateWalletLinkNonce } from "@/lib/wallet-link";

/*
 * Public (no ZRP session required - see VestingContract's schema
 * comment on why a beneficiary may not have a ZRP account at all).
 * Reuses the exact same nonce + message-signing primitive
 * src/lib/wallet-link.ts already uses to link a wallet to an account;
 * `buildWalletLinkMessage`/`generateWalletLinkNonce` were never
 * account-specific internally, they just bind whatever id string is
 * given - here that's the vesting contract id instead of a userId.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limitCheck = await rateLimit(req, { limit: 20, window: 60, type: "vesting-claim-challenge" });
    if (!limitCheck.success) return limitCheck.response;

    const { id } = await params;
    const contract = await prisma.vestingContract.findUnique({ where: { id }, select: { id: true } });
    if (!contract) {
      return NextResponse.json({ error: "Vesting contract not found." }, { status: 404 });
    }

    const { nonce, expiresAt } = generateWalletLinkNonce();
    await prisma.vestingContract.update({
      where: { id },
      data: { claimNonce: nonce, claimNonceExpiresAt: expiresAt },
    });

    return NextResponse.json({ message: buildWalletLinkMessage(id, nonce) });
  } catch (error) {
    console.error("Error issuing vesting claim challenge:", error);
    return NextResponse.json({ error: "Failed to issue claim challenge" }, { status: 500 });
  }
}
