export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { PublicKey } from "@solana/web3.js";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { jsonWithDecimalStrings } from "@/lib/launchpad/json";
import { parseCursorParams, buildPage } from "@/lib/pagination";
import { computeNftClaimableRewardRaw } from "@/lib/launchpad/nft-staking-service";

function isValidPublicKey(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

// ─── GET: a wallet's own NFT staking positions - public, wallet-native
// (no ZRP account required, same as fungible StakingPosition) ─────────
export async function GET(req: NextRequest) {
  try {
    const { cursor, limit } = parseCursorParams(req);
    const walletAddress = req.nextUrl.searchParams.get("walletAddress");
    const poolId = req.nextUrl.searchParams.get("poolId");

    const limitCheck = await rateLimit(req, { limit: 60, window: 60, type: "nft-staking-positions-list" });
    if (!limitCheck.success) return limitCheck.response;

    if (!isValidPublicKey(walletAddress)) {
      return NextResponse.json({ error: "A valid walletAddress is required." }, { status: 400 });
    }

    const positions = await prisma.nftStakingPosition.findMany({
      where: { userWalletAddress: walletAddress, ...(poolId ? { poolId } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        nft: { select: { id: true, name: true, imageUrl: true, mintAddress: true, collectionName: true } },
        pool: {
          select: {
            id: true,
            lockSeconds: true,
            rewardRatePerDayRaw: true,
            rewardToken: { select: { name: true, symbol: true, decimals: true, imageUrl: true } },
          },
        },
      },
    });

    const { items, nextCursor } = buildPage(positions, limit);
    const withClaimable = items.map((p) => ({ ...p, claimableRewardRaw: computeNftClaimableRewardRaw(p, p.pool).toString() }));

    return jsonWithDecimalStrings({ positions: withClaimable, nextCursor });
  } catch (error) {
    console.error("Error fetching NFT staking positions:", error);
    return NextResponse.json({ error: "Failed to fetch NFT staking positions" }, { status: 500 });
  }
}

// ─── POST: stake an NFT - pay externally (transfer the NFT itself,
// amount=1 of its own mint, to the platform), paste the tx signature.
// The verified on-chain sender IS the position's owner. ────────────────
export async function POST(req: NextRequest) {
  try {
    const limitCheck = await rateLimit(req, { limit: 10, window: 3600, type: "nft-staking-position-open" });
    if (!limitCheck.success) return limitCheck.response;

    const body = await req.json();
    const { poolId, nftId, walletAddress, depositTransactionId } = body;

    if (typeof poolId !== "string" || !poolId) {
      return NextResponse.json({ error: "poolId is required." }, { status: 400 });
    }
    if (typeof nftId !== "string" || !nftId) {
      return NextResponse.json({ error: "nftId is required." }, { status: 400 });
    }
    if (!isValidPublicKey(walletAddress)) {
      return NextResponse.json({ error: "A valid wallet address is required." }, { status: 400 });
    }
    if (typeof depositTransactionId !== "string" || !depositTransactionId) {
      return NextResponse.json({ error: "Transaction ID is required." }, { status: 400 });
    }

    const pool = await prisma.nftStakingPool.findUnique({ where: { id: poolId } });
    if (!pool || !pool.isActive) {
      return NextResponse.json({ error: "NFT staking pool not found or inactive." }, { status: 404 });
    }

    const nft = await prisma.launchedNft.findUnique({ where: { id: nftId } });
    if (!nft || nft.status !== "COMPLETED" || !nft.mintAddress) {
      return NextResponse.json({ error: "NFT not found or not yet minted." }, { status: 404 });
    }
    // ⚠️ SECURITY: only an NFT actually minted into this pool's
    // collection may be staked here - otherwise any ZRP-minted NFT
    // could be staked into any pool regardless of what it claims to
    // accept.
    if (nft.collectionName !== pool.collectionName) {
      return NextResponse.json({ error: "This NFT does not belong to this pool's collection." }, { status: 400 });
    }

    const existingClaim = await prisma.consumedPaymentTransaction.findUnique({ where: { transactionId: depositTransactionId } });
    if (existingClaim) {
      return NextResponse.json({ error: "Transaction already processed." }, { status: 409 });
    }

    try {
      const { verifySplTransferToPlatform } = await import("@/lib/launchpad/spl-transfer-verify");
      const result = await verifySplTransferToPlatform(depositTransactionId, nft.mintAddress);

      if (result.rawAmount !== BigInt(1)) {
        return NextResponse.json({ error: "Exactly one unit of this NFT's mint must be deposited." }, { status: 400 });
      }
      // ⚠️ SECURITY: no ZRP account is involved in staking - the
      // verified on-chain sender of the deposit IS the only proof of
      // ownership this position ever has, same as fungible staking.
      if (result.from !== walletAddress) {
        return NextResponse.json({ error: "The deposit must be sent from the wallet you're staking for." }, { status: 400 });
      }
    } catch (err: unknown) {
      console.error("NFT staking deposit verification error:", err);
      const message = err instanceof Error ? err.message : "Unknown transaction verification error";
      return NextResponse.json({ error: `Failed to verify deposit: ${message}` }, { status: 400 });
    }

    const positionId = randomUUID();
    const now = new Date();
    const unlocksAt = new Date(now.getTime() + pool.lockSeconds * 1000);

    let position;
    try {
      const created = await prisma.$transaction([
        prisma.consumedPaymentTransaction.create({
          data: { transactionId: depositTransactionId, paymentType: "nft_staking_deposit", paymentId: positionId },
        }),
        prisma.nftStakingPosition.create({
          data: {
            id: positionId,
            poolId: pool.id,
            nftId: nft.id,
            userWalletAddress: walletAddress,
            depositTransactionId,
            stakedAt: now,
            unlocksAt,
          },
        }),
      ]);
      position = created[1];
    } catch (err: any) {
      if (err?.code === "P2002") {
        return NextResponse.json({ error: "Transaction already processed." }, { status: 409 });
      }
      throw err;
    }

    return jsonWithDecimalStrings({ position }, { status: 201 });
  } catch (error) {
    console.error("NFT staking position creation error:", error);
    return NextResponse.json({ error: "Failed to open NFT staking position. Please try again." }, { status: 500 });
  }
}
