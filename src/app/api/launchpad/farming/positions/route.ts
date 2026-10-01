export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { PublicKey } from "@solana/web3.js";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { jsonWithDecimalStrings } from "@/lib/launchpad/json";
import { parseCursorParams, buildPage } from "@/lib/pagination";
import { computeClaimableRewardRaw } from "@/lib/launchpad/farming-service";

function isValidPublicKey(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

// ─── GET: a wallet's own farming positions - public, wallet-native
// (no ZRP account required, same as fungible StakingPosition) ────────
export async function GET(req: NextRequest) {
  try {
    const { cursor, limit } = parseCursorParams(req);
    const walletAddress = req.nextUrl.searchParams.get("walletAddress");
    const poolId = req.nextUrl.searchParams.get("poolId");

    const limitCheck = await rateLimit(req, { limit: 60, window: 60, type: "farming-positions-list" });
    if (!limitCheck.success) return limitCheck.response;

    if (!isValidPublicKey(walletAddress)) {
      return NextResponse.json({ error: "A valid walletAddress is required." }, { status: 400 });
    }

    const positions = await prisma.farmingPosition.findMany({
      where: { userWalletAddress: walletAddress, ...(poolId ? { poolId } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        pool: {
          select: {
            id: true,
            apyBasisPoints: true,
            lockSeconds: true,
            lpTokenName: true,
            lpTokenSymbol: true,
            lpDecimals: true,
            rewardToken: { select: { name: true, symbol: true, decimals: true, imageUrl: true } },
          },
        },
      },
    });

    const { items, nextCursor } = buildPage(positions, limit);
    const withClaimable = items.map((p) => ({ ...p, claimableRewardRaw: computeClaimableRewardRaw(p, p.pool).toString() }));

    return jsonWithDecimalStrings({ positions: withClaimable, nextCursor });
  } catch (error) {
    console.error("Error fetching farming positions:", error);
    return NextResponse.json({ error: "Failed to fetch farming positions" }, { status: 500 });
  }
}

// ─── POST: stake LP tokens into a farming pool - pay externally, paste
// the tx signature. The verified on-chain sender IS the position's
// owner. ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const limitCheck = await rateLimit(req, { limit: 10, window: 3600, type: "farming-position-open" });
    if (!limitCheck.success) return limitCheck.response;

    const body = await req.json();
    const { poolId, walletAddress, amount, depositTransactionId } = body;

    if (typeof poolId !== "string" || !poolId) {
      return NextResponse.json({ error: "poolId is required." }, { status: 400 });
    }
    if (!isValidPublicKey(walletAddress)) {
      return NextResponse.json({ error: "A valid wallet address is required." }, { status: 400 });
    }
    const amountStr = typeof amount === "string" ? amount.trim() : typeof amount === "number" ? String(Math.trunc(amount)) : "";
    if (!/^[1-9]\d*$/.test(amountStr) || amountStr.length > 20) {
      return NextResponse.json({ error: "Amount must be a positive whole number of LP tokens." }, { status: 400 });
    }
    if (typeof depositTransactionId !== "string" || !depositTransactionId) {
      return NextResponse.json({ error: "Transaction ID is required." }, { status: 400 });
    }

    const pool = await prisma.farmingPool.findUnique({ where: { id: poolId } });
    if (!pool || !pool.isActive) {
      return NextResponse.json({ error: "Farming pool not found or inactive." }, { status: 404 });
    }

    let decimalMultiplier = BigInt(1);
    for (let i = 0; i < pool.lpDecimals; i += 1) decimalMultiplier *= BigInt(10);
    const rawAmount = BigInt(amountStr) * decimalMultiplier;

    const minStakeRaw = BigInt(pool.minStakeRaw.toFixed(0));
    if (rawAmount < minStakeRaw) {
      return NextResponse.json({ error: "Amount is below this pool's minimum stake." }, { status: 400 });
    }
    if (pool.maxStakeRaw) {
      const maxStakeRaw = BigInt(pool.maxStakeRaw.toFixed(0));
      if (rawAmount > maxStakeRaw) {
        return NextResponse.json({ error: "Amount exceeds this pool's maximum stake." }, { status: 400 });
      }
    }

    const existingClaim = await prisma.consumedPaymentTransaction.findUnique({ where: { transactionId: depositTransactionId } });
    if (existingClaim) {
      return NextResponse.json({ error: "Transaction already processed." }, { status: 409 });
    }

    try {
      const { verifySplTransferToPlatform } = await import("@/lib/launchpad/spl-transfer-verify");
      const result = await verifySplTransferToPlatform(depositTransactionId, pool.lpMintAddress);

      if (result.rawAmount !== rawAmount) {
        return NextResponse.json(
          { error: "The deposited amount does not match the stake amount.", depositedRaw: result.rawAmount.toString(), requiredRaw: rawAmount.toString() },
          { status: 400 }
        );
      }
      // ⚠️ SECURITY: no ZRP account is involved in farming (same as
      // fungible staking) - the verified on-chain sender of the
      // deposit IS the only proof of ownership this position ever has.
      if (result.from !== walletAddress) {
        return NextResponse.json({ error: "The deposit must be sent from the wallet you're staking for." }, { status: 400 });
      }
    } catch (err: unknown) {
      console.error("Farming deposit verification error:", err);
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
          data: { transactionId: depositTransactionId, paymentType: "farming_deposit", paymentId: positionId },
        }),
        prisma.farmingPosition.create({
          data: {
            id: positionId,
            poolId: pool.id,
            userWalletAddress: walletAddress,
            amountRaw: rawAmount.toString(),
            depositTransactionId,
            stakedAt: now,
            unlocksAt,
          },
        }),
        prisma.farmingPool.update({
          where: { id: pool.id },
          data: { totalStakedRaw: { increment: rawAmount.toString() } },
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
    console.error("Farming position creation error:", error);
    return NextResponse.json({ error: "Failed to open farming position. Please try again." }, { status: 500 });
  }
}
