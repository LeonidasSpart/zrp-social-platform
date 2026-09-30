export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
// ⚠️ SECURITY: getVerifiedToken is a drop-in for getToken() that overlays the
// database's current role/isAdmin/plan/banned onto the decoded JWT and
// returns null for a banned or deleted account - see src/lib/auth-guards.ts.
import { getVerifiedToken as getToken } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { rateLimit, rateLimitByIpAndUser } from "@/lib/rate-limit";
import { jsonWithDecimalStrings } from "@/lib/launchpad/json";
import { parseCursorParams, buildPage } from "@/lib/pagination";

const MAX_APY_BASIS_POINTS = 100_000; // 1000% APY - a sane upper bound, not a real constraint
const MAX_LOCK_SECONDS = 10 * 365 * 24 * 3600;

// ─── GET: browse active staking pools ────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { cursor, limit } = parseCursorParams(req);
    const launchedTokenId = req.nextUrl.searchParams.get("launchedTokenId");

    const limitCheck = await rateLimit(req, { limit: 60, window: 60, type: "staking-pools-list" });
    if (!limitCheck.success) return limitCheck.response;

    const pools = await prisma.stakingPool.findMany({
      where: { isActive: true, ...(launchedTokenId ? { launchedTokenId } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        launchedToken: { select: { id: true, name: true, symbol: true, imageUrl: true, mintAddress: true, decimals: true } },
        creator: { select: { id: true, username: true, name: true, avatarUrl: true } },
      },
    });

    const { items, nextCursor } = buildPage(pools, limit);
    return jsonWithDecimalStrings({ pools: items, nextCursor });
  } catch (error) {
    console.error("Error fetching staking pools:", error);
    return NextResponse.json({ error: "Failed to fetch staking pools" }, { status: 500 });
  }
}

// ─── POST: create a staking pool for a token you created ─────────────
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = token.id as string;

    const limit = await rateLimitByIpAndUser(req, userId, { limit: 10, window: 3600, type: "staking-pool-create" });
    if (!limit.success) return limit.response;

    const body = await req.json();
    const { launchedTokenId, apyBasisPoints, lockDays, minStake, maxStake } = body;

    if (typeof launchedTokenId !== "string" || !launchedTokenId) {
      return NextResponse.json({ error: "launchedTokenId is required." }, { status: 400 });
    }
    const numericApy = Number(apyBasisPoints);
    if (!Number.isInteger(numericApy) || numericApy < 0 || numericApy > MAX_APY_BASIS_POINTS) {
      return NextResponse.json({ error: "Invalid APY." }, { status: 400 });
    }
    const lockSeconds = Math.round(Number(lockDays) * 86400);
    if (!Number.isFinite(lockSeconds) || lockSeconds < 0 || lockSeconds > MAX_LOCK_SECONDS) {
      return NextResponse.json({ error: "Invalid lock duration." }, { status: 400 });
    }

    const launchedToken = await prisma.launchedToken.findUnique({ where: { id: launchedTokenId } });
    if (!launchedToken || launchedToken.status !== "COMPLETED" || !launchedToken.mintAddress) {
      return NextResponse.json({ error: "Token not found or not yet minted." }, { status: 404 });
    }
    // ⚠️ SECURITY: only the token's own creator may open a staking pool
    // for it - otherwise anyone could set arbitrary APY/lock terms
    // against someone else's token and solicit stakes into it.
    if (launchedToken.creatorId !== userId) {
      return NextResponse.json({ error: "Only the token's creator can create a staking pool for it." }, { status: 403 });
    }

    let decimalMultiplier = BigInt(1);
    for (let i = 0; i < launchedToken.decimals; i += 1) decimalMultiplier *= BigInt(10);

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

    const pool = await prisma.stakingPool.create({
      data: {
        launchedTokenId,
        creatorId: userId,
        apyBasisPoints: numericApy,
        lockSeconds,
        minStakeRaw: minStakeRaw.toString(),
        maxStakeRaw: maxStakeRaw !== null ? maxStakeRaw.toString() : null,
      },
    });

    return jsonWithDecimalStrings({ pool }, { status: 201 });
  } catch (error) {
    console.error("Staking pool creation error:", error);
    return NextResponse.json({ error: "Failed to create staking pool. Please try again." }, { status: 500 });
  }
}
