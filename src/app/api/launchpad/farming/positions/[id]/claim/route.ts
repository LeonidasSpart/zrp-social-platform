export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { buildWalletLinkMessage, verifyWalletSignature } from "@/lib/wallet-link";
import {
  computeClaimableRewardRaw,
  executeStakingPayout,
  reserveFarmingRewardFromPool,
  refundFarmingRewardToPool,
} from "@/lib/launchpad/farming-service";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limitCheck = await rateLimit(req, { limit: 10, window: 60, type: "farming-claim" });
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

    const position = await prisma.farmingPosition.findUnique({
      where: { id },
      include: { pool: { include: { rewardToken: { select: { mintAddress: true } } } } },
    });
    if (!position) {
      return NextResponse.json({ error: "Farming position not found." }, { status: 404 });
    }
    if (position.userWalletAddress !== walletAddress) {
      return NextResponse.json({ error: "This wallet does not own this farming position." }, { status: 403 });
    }
    if (!position.claimNonce || !position.claimNonceExpiresAt || position.claimNonceExpiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "Claim challenge expired or missing. Request a new one." }, { status: 400 });
    }

    const message = buildWalletLinkMessage(id, position.claimNonce);
    if (!verifyWalletSignature(walletAddress, message, signature)) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
    }

    // Atomically consume the nonce - also what serializes concurrent
    // claim attempts on the same position, same as fungible staking.
    const claimedNonce = await prisma.farmingPosition.updateMany({
      where: { id, claimNonce: position.claimNonce },
      data: { claimNonce: null, claimNonceExpiresAt: null },
    });
    if (claimedNonce.count === 0) {
      return NextResponse.json({ error: "This claim was already processed." }, { status: 409 });
    }

    const rewardMintAddress = position.pool.rewardToken.mintAddress;
    if (!rewardMintAddress) {
      return NextResponse.json({ error: "This reward token has not finished minting yet." }, { status: 500 });
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

      const reserved = await reserveFarmingRewardFromPool(position.poolId, rewardRaw);
      if (!reserved) {
        return NextResponse.json({ error: "This pool's reward reserve can't currently cover your accrued rewards. Try again later." }, { status: 400 });
      }

      // Atomically transition ACTIVE -> UNSTAKED before paying out, so
      // a second concurrent unstake attempt can never double-pay.
      const claimedStatus = await prisma.farmingPosition.updateMany({
        where: { id, status: "ACTIVE" },
        data: { status: "UNSTAKED" },
      });
      if (claimedStatus.count === 0) {
        await refundFarmingRewardToPool(position.poolId, rewardRaw);
        return NextResponse.json({ error: "This position has already been unstaked." }, { status: 409 });
      }

      // Two independent payouts, different mints: the LP token itself
      // (back to the staker) and the accrued reward (the pool's reward
      // token mint) - unlike fungible staking, principal and reward are
      // never the same mint here, since the staked asset is an external
      // LP token, not a ZRP-minted token.
      const principalPayout = await executeStakingPayout({
        logContext: `farming unstake ${id} (principal)`,
        mintAddress: position.pool.lpMintAddress,
        recipientWalletAddress: walletAddress,
        amountRaw: principalRaw,
      });
      if (!principalPayout.success) {
        await refundFarmingRewardToPool(position.poolId, rewardRaw);
        await prisma.farmingPosition.updateMany({ where: { id, status: "UNSTAKED" }, data: { status: "ACTIVE" } });
        return NextResponse.json({ error: principalPayout.error || "Returning the LP tokens failed." }, { status: 502 });
      }

      let rewardSignature: string | undefined;
      if (rewardRaw > BigInt(0)) {
        const rewardPayout = await executeStakingPayout({
          logContext: `farming unstake ${id} (reward)`,
          mintAddress: rewardMintAddress,
          recipientWalletAddress: walletAddress,
          amountRaw: rewardRaw,
        });
        if (!rewardPayout.success) {
          // The LP principal already moved and can't be rolled back
          // here - the reward reserve stays reserved rather than
          // refunded, and the position stays UNSTAKED: a stuck, unpaid
          // reward is a known, documented gap (same reconciliation-job
          // scope boundary every other launchpad payout path in this
          // codebase accepts), not silently lost bookkeeping.
          console.error(`Farming unstake ${id}: LP returned but reward payout failed:`, rewardPayout.error);
        } else {
          rewardSignature = rewardPayout.signature;
          await prisma.farmingPosition.update({ where: { id }, data: { rewardClaimedRaw: { increment: rewardRaw.toString() } } });
        }
      }

      await prisma.farmingPool.update({ where: { id: position.poolId }, data: { totalStakedRaw: { decrement: principalRaw.toString() } } });

      return NextResponse.json({
        success: true,
        unstaked: true,
        principal: principalRaw.toString(),
        reward: rewardRaw.toString(),
        principalTransactionId: principalPayout.signature,
        rewardTransactionId: rewardSignature,
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

    const reserved = await reserveFarmingRewardFromPool(position.poolId, rewardRaw);
    if (!reserved) {
      return NextResponse.json({ error: "This pool's reward reserve can't currently cover your accrued rewards. Try again later." }, { status: 400 });
    }

    const payout = await executeStakingPayout({
      logContext: `farming reward claim ${id}`,
      mintAddress: rewardMintAddress,
      recipientWalletAddress: walletAddress,
      amountRaw: rewardRaw,
    });

    if (!payout.success) {
      await refundFarmingRewardToPool(position.poolId, rewardRaw);
      return NextResponse.json({ error: payout.error || "Claim failed." }, { status: 502 });
    }

    await prisma.farmingPosition.update({ where: { id }, data: { rewardClaimedRaw: { increment: rewardRaw.toString() } } });

    return NextResponse.json({ success: true, unstaked: false, reward: rewardRaw.toString(), transactionId: payout.signature });
  } catch (error) {
    console.error("Farming claim error:", error);
    return NextResponse.json({ error: "Failed to process claim. Please try again." }, { status: 500 });
  }
}
