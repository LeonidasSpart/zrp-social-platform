export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
// ⚠️ SECURITY: getVerifiedToken is a drop-in for getToken() that overlays the
// database's current role/isAdmin/plan/banned onto the decoded JWT and
// returns null for a banned or deleted account - see src/lib/auth-guards.ts.
import { getVerifiedToken as getToken } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { rateLimit, rateLimitByIpAndUser } from "@/lib/rate-limit";
import { jsonWithDecimalStrings } from "@/lib/launchpad/json";
import { parseCursorParams, buildPage } from "@/lib/pagination";
import { getVerifiedWallet } from "@/lib/launchpad/entitlement";

const MAX_APY_BASIS_POINTS = 100_000; // 1000% APY - a sane upper bound, not a real constraint
const MAX_LOCK_SECONDS = 10 * 365 * 24 * 3600;

function isValidPublicKey(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

// ─── GET: browse active farming pools ─────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { cursor, limit } = parseCursorParams(req);

    const limitCheck = await rateLimit(req, { limit: 60, window: 60, type: "farming-pools-list" });
    if (!limitCheck.success) return limitCheck.response;

    const pools = await prisma.farmingPool.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        rewardToken: { select: { id: true, name: true, symbol: true, imageUrl: true, mintAddress: true, decimals: true } },
        creator: { select: { id: true, username: true, name: true, avatarUrl: true } },
      },
    });

    const { items, nextCursor } = buildPage(pools, limit);
    return jsonWithDecimalStrings({ pools: items, nextCursor });
  } catch (error) {
    console.error("Error fetching farming pools:", error);
    return NextResponse.json({ error: "Failed to fetch farming pools" }, { status: 500 });
  }
}

// ─── POST: open a liquidity farming pool for an external LP token ─────
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = token.id as string;

    const limit = await rateLimitByIpAndUser(req, userId, { limit: 10, window: 3600, type: "farming-pool-create" });
    if (!limit.success) return limit.response;

    // ⚠️ SECURITY: a farming pool's underlying LP token isn't minted by
    // ZRP, so there's no "own the token" check possible the way
    // StakingPool has - a verified wallet is the only real entitlement
    // gate available, same bar as every other monetary launchpad action.
    const walletAddress = await getVerifiedWallet(userId);
    if (!walletAddress) {
      return NextResponse.json(
        { error: "Link and verify a Solana wallet in Settings before creating a farming pool." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { lpMintAddress, lpTokenName, lpTokenSymbol, lpDecimals, rewardTokenId, apyBasisPoints, lockDays, minStake, maxStake } = body;

    if (!isValidPublicKey(lpMintAddress)) {
      return NextResponse.json({ error: "A valid LP token mint address is required." }, { status: 400 });
    }
    if (typeof lpTokenName !== "string" || !lpTokenName.trim() || lpTokenName.trim().length > 32) {
      return NextResponse.json({ error: "LP token name is required (max 32 characters)." }, { status: 400 });
    }
    if (typeof lpTokenSymbol !== "string" || !/^[A-Za-z0-9]{1,10}$/.test(lpTokenSymbol.trim())) {
      return NextResponse.json({ error: "LP token symbol is required (max 10 letters/numbers, no spaces)." }, { status: 400 });
    }
    const numericLpDecimals = Number(lpDecimals);
    if (!Number.isInteger(numericLpDecimals) || numericLpDecimals < 0 || numericLpDecimals > 9) {
      return NextResponse.json({ error: "LP token decimals must be an integer between 0 and 9." }, { status: 400 });
    }
    if (typeof rewardTokenId !== "string" || !rewardTokenId) {
      return NextResponse.json({ error: "rewardTokenId is required." }, { status: 400 });
    }
    const numericApy = Number(apyBasisPoints);
    if (!Number.isInteger(numericApy) || numericApy < 0 || numericApy > MAX_APY_BASIS_POINTS) {
      return NextResponse.json({ error: "Invalid APY." }, { status: 400 });
    }
    const lockSeconds = Math.round(Number(lockDays) * 86400);
    if (!Number.isFinite(lockSeconds) || lockSeconds < 0 || lockSeconds > MAX_LOCK_SECONDS) {
      return NextResponse.json({ error: "Invalid lock duration." }, { status: 400 });
    }

    const rewardToken = await prisma.launchedToken.findUnique({ where: { id: rewardTokenId } });
    if (!rewardToken || rewardToken.status !== "COMPLETED" || !rewardToken.mintAddress) {
      return NextResponse.json({ error: "Reward token not found or not yet minted." }, { status: 404 });
    }

    let decimalMultiplier = BigInt(1);
    for (let i = 0; i < numericLpDecimals; i += 1) decimalMultiplier *= BigInt(10);

    const minStakeStr = typeof minStake === "string" ? minStake.trim() : typeof minStake === "number" ? String(Math.trunc(minStake)) : "0";
    if (!/^\d+$/.test(minStakeStr) || minStakeStr.length > 20) {
      return NextResponse.json({ error: "Invalid minimum stake." }, { status: 400 });
    }
    const minStakeRaw = BigInt(minStakeStr) * decimalMultiplier;

    let maxStakeRaw: bigint | null = null;
    if (maxStake !== undefined && maxStake !== null && maxStake !== "") {
      const maxStakeStr = typeof maxStake === "string" ? maxStake.trim() : String(Math.trunc(Number(maxStake)));
      if (!/^\d+$/.test(maxStakeStr) || maxStakeStr.length > 20) {
        return NextResponse.json({ error: "Invalid maximum stake." }, { status: 400 });
      }
      maxStakeRaw = BigInt(maxStakeStr) * decimalMultiplier;
      if (maxStakeRaw < minStakeRaw) {
        return NextResponse.json({ error: "Maximum stake must be at least the minimum stake." }, { status: 400 });
      }
    }

    const pool = await prisma.farmingPool.create({
      data: {
        lpMintAddress: lpMintAddress.trim(),
        lpTokenName: lpTokenName.trim(),
        lpTokenSymbol: lpTokenSymbol.trim().toUpperCase(),
        lpDecimals: numericLpDecimals,
        creatorId: userId,
        rewardTokenId,
        apyBasisPoints: numericApy,
        lockSeconds,
        minStakeRaw: minStakeRaw.toString(),
        maxStakeRaw: maxStakeRaw !== null ? maxStakeRaw.toString() : null,
      },
    });

    return jsonWithDecimalStrings({ pool }, { status: 201 });
  } catch (error) {
    console.error("Farming pool creation error:", error);
    return NextResponse.json({ error: "Failed to create farming pool. Please try again." }, { status: 500 });
  }
}
