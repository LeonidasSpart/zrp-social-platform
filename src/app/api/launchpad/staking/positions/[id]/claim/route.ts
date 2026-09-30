export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { buildWalletLinkMessage, verifyWalletSignature } from "@/lib/wallet-link";
import { computeClaimableRewardRaw, executeStakingPayout, reserveRewardFromPool, refundRewardToPool } from "@/lib/launchpad/staking-service";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limitCheck = await rateLimit(req, { limit: 10, window: 60, type: "staking-claim" });
    if (!limitCheck.success) return limitCheck.response;

    const { id } = await params;
    const body = await req.json();
    const { walletAddress, signature, unstakePrincipal } = body;

    if (typeof walletAddress !== "string" || !walletAddress) {
      return NextResponse.json({ error: "walletAddress is required." }, { status: 400 });
    }
    if (typeof signature !== "string" || !signature) {
      return NextResponse.json({ error: "signature is required." }, { status: 400 });
    }

    const position = await prisma.stakingPosition.findUnique({
      where: { id },
      include: { pool: { include: { launchedToken: { select: { mintAddress: true } } } } },
    });
    if (!position) {
      return NextResponse.json({ error: "Staking position not found." }, { status: 404 });
    }
    if (position.userWalletAddress !== walletAddress) {
      return NextResponse.json({ error: "This wallet does not own this staking position." }, { status: 403 });
    }
    if (!position.claimNonce || !position.claimNonceExpiresAt || position.claimNonceExpiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "Claim challenge expired or missing. Request a new one." }, { status: 400 });
    }

    const message = buildWalletLinkMessage(id, position.claimNonce);
    if (!verifyWalletSignature(walletAddress, message, signature)) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
    }

    // Atomically consume the nonce - this is also what serializes
    // concurrent claim attempts on the same position, since each valid
    // signature can only win this once.
    const claimedNonce = await prisma.stakingPosition.updateMany({
      where: { id, claimNonce: position.claimNonce },
      data: { claimNonce: null, claimNonceExpiresAt: null },
    });
    if (claimedNonce.count === 0) {
      return NextResponse.json({ error: "This claim was already processed." }, { status: 409 });
    }

    const mintAddress = position.pool.launchedToken.mintAddress;
    if (!mintAddress) {
      return NextResponse.json({ error: "This token has not finished minting yet." }, { status: 500 });
    }

    if (unstakePrincipal === true) {
      if (position.status !== "ACTIVE") {
        return NextResponse.json({ error: "This position has already been unstaked." }, { status: 400 });
      }
      if (Date.now() < position.unlocksAt.getTime()) {
        return NextResponse.json({ error: `This position is locked until ${position.unlocksAt.toISOString()}.` }, { status: 400 });
      }

      const rewardRaw = computeClaimableRewardRaw(position, position.pool);
      const principalRaw = BigInt(position.amountRaw.toFixed(0));

      const reserved = await reserveRewardFromPool(position.poolId, rewardRaw);
      if (!reserved) {
        return NextResponse.json({ error: "This pool's reward reserve can't currently cover your accrued rewards. Try again later." }, { status: 400 });
      }

      // Atomically transition ACTIVE -> UNSTAKED before paying out, so
      // a second concurrent unstake attempt (a different, still-valid
      // path into this branch) can never double-pay principal.
      const claimedStatus = await prisma.stakingPosition.updateMany({
        where: { id, status: "ACTIVE" },
        data: { status: "UNSTAKED" },
      });
      if (claimedStatus.count === 0) {
        await refundRewardToPool(position.poolId, rewardRaw);
        return NextResponse.json({ error: "This position has already been unstaked." }, { status: 409 });
      }

      const payout = await executeStakingPayout({
        logContext: `unstake ${id}`,
        mintAddress,
        recipientWalletAddress: walletAddress,
        amountRaw: principalRaw + rewardRaw,
      });

      if (!payout.success) {
        // Roll back both reservations so the position isn't left
        // stuck "UNSTAKED but never paid" - a fresh claim-challenge
        // lets the user retry.
        await refundRewardToPool(position.poolId, rewardRaw);
        await prisma.stakingPosition.updateMany({ where: { id, status: "UNSTAKED" }, data: { status: "ACTIVE" } });
        return NextResponse.json({ error: payout.error || "Unstake failed." }, { status: 502 });
      }

      await prisma.$transaction([
        prisma.stakingPosition.update({ where: { id }, data: { rewardClaimedRaw: { increment: rewardRaw.toString() } } }),
        prisma.stakingPool.update({ where: { id: position.poolId }, data: { totalStakedRaw: { decrement: principalRaw.toString() } } }),
      ]);

      return NextResponse.json({
        success: true,
        unstaked: true,
        principal: principalRaw.toString(),
        reward: rewardRaw.toString(),
        transactionId: payout.signature,
      });
    }

    // Claim rewards only - principal stays staked.
    if (position.status !== "ACTIVE") {
      return NextResponse.json({ error: "This position has already been unstaked." }, { status: 400 });
    }

    const rewardRaw = computeClaimableRewardRaw(position, position.pool);
    if (rewardRaw <= BigInt(0)) {
      return NextResponse.json({ error: "Nothing is available to claim yet." }, { status: 400 });
    }

    const reserved = await reserveRewardFromPool(position.poolId, rewardRaw);
    if (!reserved) {
      return NextResponse.json({ error: "This pool's reward reserve can't currently cover your accrued rewards. Try again later." }, { status: 400 });
    }

    const payout = await executeStakingPayout({
      logContext: `reward claim ${id}`,
      mintAddress,
      recipientWalletAddress: walletAddress,
      amountRaw: rewardRaw,
    });

    if (!payout.success) {
      await refundRewardToPool(position.poolId, rewardRaw);
      return NextResponse.json({ error: payout.error || "Claim failed." }, { status: 502 });
    }

    await prisma.stakingPosition.update({ where: { id }, data: { rewardClaimedRaw: { increment: rewardRaw.toString() } } });

    return NextResponse.json({ success: true, unstaked: false, reward: rewardRaw.toString(), transactionId: payout.signature });
  } catch (error) {
    console.error("Staking claim error:", error);
    return NextResponse.json({ error: "Failed to process claim. Please try again." }, { status: 500 });
  }
}
