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

const MAX_LOCK_SECONDS = 10 * 365 * 24 * 3600;

// ─── GET: browse active NFT staking pools ─────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { cursor, limit } = parseCursorParams(req);
    const collectionName = req.nextUrl.searchParams.get("collectionName");

    const limitCheck = await rateLimit(req, { limit: 60, window: 60, type: "nft-staking-pools-list" });
    if (!limitCheck.success) return limitCheck.response;

    const pools = await prisma.nftStakingPool.findMany({
      where: { isActive: true, ...(collectionName ? { collectionName } : {}) },
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
    console.error("Error fetching NFT staking pools:", error);
    return NextResponse.json({ error: "Failed to fetch NFT staking pools" }, { status: 500 });
  }
}

// ─── POST: create an NFT staking pool for a collection you minted ─────
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = token.id as string;

    const limit = await rateLimitByIpAndUser(req, userId, { limit: 10, window: 3600, type: "nft-staking-pool-create" });
    if (!limit.success) return limit.response;

    const body = await req.json();
    const { collectionName, rewardTokenId, rewardRatePerDay, lockDays } = body;

    if (typeof collectionName !== "string" || !collectionName.trim() || collectionName.trim().length > 64) {
      return NextResponse.json({ error: "A collection name is required." }, { status: 400 });
    }
    const cleanCollectionName = collectionName.trim();

    if (typeof rewardTokenId !== "string" || !rewardTokenId) {
      return NextResponse.json({ error: "rewardTokenId is required." }, { status: 400 });
    }

    const lockSeconds = Math.round(Number(lockDays) * 86400);
    if (!Number.isFinite(lockSeconds) || lockSeconds < 0 || lockSeconds > MAX_LOCK_SECONDS) {
      return NextResponse.json({ error: "Invalid lock duration." }, { status: 400 });
    }

    // ⚠️ SECURITY: only someone who has actually minted a COMPLETED NFT
    // under this exact collectionName may open a staking pool for it -
    // collectionName is free text (no on-chain Metaplex Certified
    // Collection check, see LaunchedNft's schema comment), so this is
    // the only thing stopping anyone from opening a pool "for" a
    // collection they have no connection to and soliciting stakes into
    // it under someone else's name.
    const ownsCollection = await prisma.launchedNft.findFirst({
      where: { creatorId: userId, collectionName: cleanCollectionName, status: "COMPLETED" },
      select: { id: true },
    });
    if (!ownsCollection) {
      return NextResponse.json(
        { error: "You can only open a staking pool for a collection you've minted at least one NFT into." },
        { status: 403 }
      );
    }

    const rewardToken = await prisma.launchedToken.findUnique({ where: { id: rewardTokenId } });
    if (!rewardToken || rewardToken.status !== "COMPLETED" || !rewardToken.mintAddress) {
      return NextResponse.json({ error: "Reward token not found or not yet minted." }, { status: 404 });
    }

    let decimalMultiplier = BigInt(1);
    for (let i = 0; i < rewardToken.decimals; i += 1) decimalMultiplier *= BigInt(10);

    const rateStr =
      typeof rewardRatePerDay === "string"
        ? rewardRatePerDay.trim()
        : typeof rewardRatePerDay === "number"
          ? String(Math.trunc(rewardRatePerDay))
          : "";
    if (!/^\d+$/.test(rateStr) || rateStr.length > 20) {
      return NextResponse.json({ error: "Invalid reward rate." }, { status: 400 });
    }
    const rewardRatePerDayRaw = BigInt(rateStr) * decimalMultiplier;

    const pool = await prisma.nftStakingPool.create({
      data: {
        collectionName: cleanCollectionName,
        creatorId: userId,
        rewardTokenId,
        rewardRatePerDayRaw: rewardRatePerDayRaw.toString(),
        lockSeconds,
      },
    });

    return jsonWithDecimalStrings({ pool }, { status: 201 });
  } catch (error) {
    console.error("NFT staking pool creation error:", error);
    return NextResponse.json({ error: "Failed to create NFT staking pool. Please try again." }, { status: 500 });
  }
}
