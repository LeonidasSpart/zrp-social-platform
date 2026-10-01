export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { buildWalletLinkMessage, generateWalletLinkNonce } from "@/lib/wallet-link";

/*
 * Public - the same single-use ed25519 challenge pattern as a vesting
 * claim (see VestingContract's schema comment), bound to this staking
 * position's id instead of a vesting contract id.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limitCheck = await rateLimit(req, { limit: 20, window: 60, type: "staking-claim-challenge" });
    if (!limitCheck.success) return limitCheck.response;

    const { id } = await params;
    const position = await prisma.stakingPosition.findUnique({ where: { id }, select: { id: true, disputedTransactionId: true } });
    if (!position) {
      return NextResponse.json({ error: "Staking position not found." }, { status: 404 });
    }
    // A prior claim's on-chain outcome couldn't be confirmed and may
    // have already paid out - see StakingPosition.disputedTransactionId.
    if (position.disputedTransactionId) {
      return NextResponse.json(
        { error: "A previous claim on this position could not be confirmed and is under manual review. Contact support." },
        { status: 409 }
      );
    }

    const { nonce, expiresAt } = generateWalletLinkNonce();
    await prisma.stakingPosition.update({
      where: { id },
      data: { claimNonce: nonce, claimNonceExpiresAt: expiresAt },
    });

    return NextResponse.json({ message: buildWalletLinkMessage(id, nonce) });
  } catch (error) {
    console.error("Error issuing staking claim challenge:", error);
    return NextResponse.json({ error: "Failed to issue claim challenge" }, { status: 500 });
  }
}
