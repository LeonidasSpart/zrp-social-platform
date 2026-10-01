export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { buildWalletLinkMessage, verifyWalletSignature } from "@/lib/wallet-link";
import { computeClaimableRaw, executeVestingClaim } from "@/lib/launchpad/vesting-service";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limitCheck = await rateLimit(req, { limit: 10, window: 60, type: "vesting-claim" });
    if (!limitCheck.success) return limitCheck.response;

    const { id } = await params;
    const body = await req.json();
    const { walletAddress, signature } = body;

    if (typeof walletAddress !== "string" || !walletAddress) {
      return NextResponse.json({ error: "walletAddress is required." }, { status: 400 });
    }
    if (typeof signature !== "string" || !signature) {
      return NextResponse.json({ error: "signature is required." }, { status: 400 });
    }

    const contract = await prisma.vestingContract.findUnique({
      where: { id },
      include: { launchedToken: { select: { mintAddress: true } } },
    });
    if (!contract) {
      return NextResponse.json({ error: "Vesting contract not found." }, { status: 404 });
    }
    if (contract.beneficiaryWalletAddress !== walletAddress) {
      return NextResponse.json({ error: "This wallet is not the beneficiary of this contract." }, { status: 403 });
    }
    if (!contract.claimNonce || !contract.claimNonceExpiresAt || contract.claimNonceExpiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "Claim challenge expired or missing. Request a new one." }, { status: 400 });
    }

    const message = buildWalletLinkMessage(id, contract.claimNonce);
    if (!verifyWalletSignature(walletAddress, message, signature)) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
    }

    // Atomically consume the nonce (compare-and-clear) - a double-submit
    // race of the same valid signature can only win this once.
    const claimedNonce = await prisma.vestingContract.updateMany({
      where: { id, claimNonce: contract.claimNonce },
      data: { claimNonce: null, claimNonceExpiresAt: null },
    });
    if (claimedNonce.count === 0) {
      return NextResponse.json({ error: "This claim was already processed." }, { status: 409 });
    }

    if (!contract.launchedToken.mintAddress) {
      return NextResponse.json({ error: "This token has not finished minting yet." }, { status: 500 });
    }

    const claimableRaw = computeClaimableRaw(contract);
    if (claimableRaw <= BigInt(0)) {
      return NextResponse.json({ error: "Nothing is available to claim yet." }, { status: 400 });
    }

    const result = await executeVestingClaim({
      contractId: id,
      mintAddress: contract.launchedToken.mintAddress,
      beneficiaryWalletAddress: walletAddress,
      claimableRaw,
    });

    if (!result.success) {
      if (result.ambiguous) {
        // The transfer was broadcast but its outcome couldn't be
        // confirmed - it may have already succeeded. Never let another
        // claim through against this contract until an operator has
        // manually verified the signature on-chain (see
        // VestingContract.disputedTransactionId's schema comment).
        await prisma.vestingContract.update({
          where: { id },
          data: { disputedTransactionId: result.signature ?? "unknown", disputedAt: new Date() },
        });
        return NextResponse.json(
          {
            error: "This claim's outcome could not be confirmed on-chain. It may have already succeeded - do not retry. Support will verify and resolve this.",
            disputed: true,
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: result.error || "Claim failed." }, { status: 502 });
    }

    return NextResponse.json({ success: true, amount: claimableRaw.toString(), transactionId: result.signature });
  } catch (error) {
    console.error("Vesting claim error:", error);
    return NextResponse.json({ error: "Failed to process claim. Please try again." }, { status: 500 });
  }
}
