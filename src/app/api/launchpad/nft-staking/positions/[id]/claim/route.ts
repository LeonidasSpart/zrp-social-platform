export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { buildWalletLinkMessage, verifyWalletSignature } from "@/lib/wallet-link";
import {
  computeNftClaimableRewardRaw,
  executeStakingPayout,
  reserveNftRewardFromPool,
  refundNftRewardToPool,
} from "@/lib/launchpad/nft-staking-service";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limitCheck = await rateLimit(req, { limit: 10, window: 60, type: "nft-staking-claim" });
    if (!limitCheck.success) return limitCheck.response;

    const { id } = await params;
    const body = await req.json();
    const { walletAddress, signature, unstakeNft } = body;

    if (typeof walletAddress !== "string" || !walletAddress) {
      return NextResponse.json({ error: "walletAddress is required." }, { status: 400 });
    }
    if (typeof signature !== "string" || !signature) {
      return NextResponse.json({ error: "signature is required." }, { status: 400 });
    }

    const position = await prisma.nftStakingPosition.findUnique({
      where: { id },
      include: {
        nft: { select: { mintAddress: true } },
        pool: { include: { rewardToken: { select: { mintAddress: true } } } },
      },
    });
    if (!position) {
      return NextResponse.json({ error: "NFT staking position not found." }, { status: 404 });
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

    // Atomically consume the nonce - also what serializes concurrent
    // claim attempts on the same position, same as fungible staking.
    const claimedNonce = await prisma.nftStakingPosition.updateMany({
      where: { id, claimNonce: position.claimNonce },
      data: { claimNonce: null, claimNonceExpiresAt: null },
    });
    if (claimedNonce.count === 0) {
      return NextResponse.json({ error: "This claim was already processed." }, { status: 409 });
    }

    const nftMintAddress = position.nft.mintAddress;
    const rewardMintAddress = position.pool.rewardToken.mintAddress;
    if (!nftMintAddress || !rewardMintAddress) {
      return NextResponse.json({ error: "This NFT or reward token has not finished minting yet." }, { status: 500 });
    }

    if (unstakeNft === true) {
      if (position.status !== "ACTIVE") {
        return NextResponse.json({ error: "This position has already been unstaked." }, { status: 400 });
      }
      if (Date.now() < position.unlocksAt.getTime()) {
        return NextResponse.json({ error: `This position is locked until ${position.unlocksAt.toISOString()}.` }, { status: 400 });
      }

      const rewardRaw = computeNftClaimableRewardRaw(position, position.pool);

      const reserved = await reserveNftRewardFromPool(position.poolId, rewardRaw);
      if (!reserved) {
        return NextResponse.json({ error: "This pool's reward reserve can't currently cover your accrued rewards. Try again later." }, { status: 400 });
      }

      // Atomically transition ACTIVE -> UNSTAKED before paying out, so
      // a second concurrent unstake attempt can never double-pay.
      const claimedStatus = await prisma.nftStakingPosition.updateMany({
        where: { id, status: "ACTIVE" },
        data: { status: "UNSTAKED" },
      });
      if (claimedStatus.count === 0) {
        await refundNftRewardToPool(position.poolId, rewardRaw);
        return NextResponse.json({ error: "This position has already been unstaked." }, { status: 409 });
      }

      // Two independent payouts, different mints: the NFT itself (its
      // own mint, amount 1) and the accrued reward (the pool's reward
      // token mint) - unlike fungible staking, principal and reward are
      // never the same mint here.
      const nftPayout = await executeStakingPayout({
        logContext: `NFT unstake ${id} (principal)`,
        mintAddress: nftMintAddress,
        recipientWalletAddress: walletAddress,
        amountRaw: BigInt(1),
      });
      if (!nftPayout.success) {
        if (nftPayout.ambiguous) {
          // Broadcast but unconfirmed - may have actually landed.
          // Leave the position UNSTAKED and the reserve consumed as-is;
          // reopening/refunding here is what would let a second, real
          // payout through. See NftStakingPosition.disputedTransactionId.
          await prisma.nftStakingPosition.update({
            where: { id },
            data: { disputedTransactionId: nftPayout.signature ?? "unknown", disputedAt: new Date() },
          });
          return NextResponse.json(
            {
              error: "This unstake's outcome could not be confirmed on-chain. It may have already succeeded - do not retry. Support will verify and resolve this.",
              disputed: true,
            },
            { status: 409 }
          );
        }
        await refundNftRewardToPool(position.poolId, rewardRaw);
        await prisma.nftStakingPosition.updateMany({ where: { id, status: "UNSTAKED" }, data: { status: "ACTIVE" } });
        return NextResponse.json({ error: nftPayout.error || "Returning the NFT failed." }, { status: 502 });
      }

      let rewardSignature: string | undefined;
      if (rewardRaw > BigInt(0)) {
        const rewardPayout = await executeStakingPayout({
          logContext: `NFT unstake ${id} (reward)`,
          mintAddress: rewardMintAddress,
          recipientWalletAddress: walletAddress,
          amountRaw: rewardRaw,
        });
        if (!rewardPayout.success) {
          // The NFT itself already moved and can't be rolled back here -
          // the reward reserve stays reserved rather than refunded, and
          // the position stays UNSTAKED: a stuck, unpaid reward is a
          // known, documented gap (same reconciliation-job scope boundary
          // every other launchpad payout path in this codebase accepts -
          // see mint-service.ts's own comment), not silently lost
          // bookkeeping.
          console.error(`NFT unstake ${id}: NFT returned but reward payout failed:`, rewardPayout.error);
        } else {
          rewardSignature = rewardPayout.signature;
          await prisma.nftStakingPosition.update({ where: { id }, data: { rewardClaimedRaw: { increment: rewardRaw.toString() } } });
        }
      }

      return NextResponse.json({
        success: true,
        unstaked: true,
        reward: rewardRaw.toString(),
        nftTransactionId: nftPayout.signature,
        rewardTransactionId: rewardSignature,
      });
    }

    // Claim rewards only - the NFT stays staked.
    if (position.status !== "ACTIVE") {
      return NextResponse.json({ error: "This position has already been unstaked." }, { status: 400 });
    }

    const rewardRaw = computeNftClaimableRewardRaw(position, position.pool);
    if (rewardRaw <= BigInt(0)) {
      return NextResponse.json({ error: "Nothing is available to claim yet." }, { status: 400 });
    }

    const reserved = await reserveNftRewardFromPool(position.poolId, rewardRaw);
    if (!reserved) {
      return NextResponse.json({ error: "This pool's reward reserve can't currently cover your accrued rewards. Try again later." }, { status: 400 });
    }

    const payout = await executeStakingPayout({
      logContext: `NFT reward claim ${id}`,
      mintAddress: rewardMintAddress,
      recipientWalletAddress: walletAddress,
      amountRaw: rewardRaw,
    });

    if (!payout.success) {
      if (payout.ambiguous) {
        await prisma.nftStakingPosition.update({
          where: { id },
          data: { disputedTransactionId: payout.signature ?? "unknown", disputedAt: new Date() },
        });
        return NextResponse.json(
          {
            error: "This claim's outcome could not be confirmed on-chain. It may have already succeeded - do not retry. Support will verify and resolve this.",
            disputed: true,
          },
          { status: 409 }
        );
      }
      await refundNftRewardToPool(position.poolId, rewardRaw);
      return NextResponse.json({ error: payout.error || "Claim failed." }, { status: 502 });
    }

    await prisma.nftStakingPosition.update({ where: { id }, data: { rewardClaimedRaw: { increment: rewardRaw.toString() } } });

    return NextResponse.json({ success: true, unstaked: false, reward: rewardRaw.toString(), transactionId: payout.signature });
  } catch (error) {
    console.error("NFT staking claim error:", error);
    return NextResponse.json({ error: "Failed to process claim. Please try again." }, { status: 500 });
  }
}
