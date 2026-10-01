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

const MAX_VOTING_PERIOD_SECONDS = 90 * 24 * 3600; // 90 days
const MIN_VOTING_PERIOD_SECONDS = 3600; // 1 hour

// ─── GET: browse DAOs ──────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { cursor, limit } = parseCursorParams(req);

    const limitCheck = await rateLimit(req, { limit: 60, window: 60, type: "dao-list" });
    if (!limitCheck.success) return limitCheck.response;

    const daos = await prisma.dao.findMany({
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        launchedToken: { select: { id: true, name: true, symbol: true, imageUrl: true, mintAddress: true, decimals: true } },
        creator: { select: { id: true, username: true, name: true, avatarUrl: true } },
        _count: { select: { proposals: true } },
      },
    });

    const { items, nextCursor } = buildPage(daos, limit);
    return jsonWithDecimalStrings({ daos: items, nextCursor });
  } catch (error) {
    console.error("Error fetching DAOs:", error);
    return NextResponse.json({ error: "Failed to fetch DAOs" }, { status: 500 });
  }
}

// ─── POST: stand up a DAO for an already-launched token ────────────────
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = token.id as string;

    const limit = await rateLimitByIpAndUser(req, userId, { limit: 10, window: 3600, type: "dao-create" });
    if (!limit.success) return limit.response;

    const body = await req.json();
    const { launchedTokenId, name, description, quorum, proposalThreshold, votingPeriodDays } = body;

    if (typeof launchedTokenId !== "string" || !launchedTokenId) {
      return NextResponse.json({ error: "launchedTokenId is required." }, { status: 400 });
    }
    if (typeof name !== "string" || !name.trim() || name.trim().length > 60) {
      return NextResponse.json({ error: "DAO name is required (max 60 characters)." }, { status: 400 });
    }
    if (description !== undefined && description !== null && (typeof description !== "string" || description.length > 2000)) {
      return NextResponse.json({ error: "Description must be 2000 characters or fewer." }, { status: 400 });
    }

    const launchedToken = await prisma.launchedToken.findUnique({ where: { id: launchedTokenId } });
    if (!launchedToken || launchedToken.status !== "COMPLETED" || !launchedToken.mintAddress) {
      return NextResponse.json({ error: "Token not found or not yet minted." }, { status: 404 });
    }
    // ⚠️ SECURITY: unlike a farming pool's external LP token, a
    // governance token IS one ZRP minted and has a real creatorId on
    // file - only that token's own creator may stand up its DAO.
    if (launchedToken.creatorId !== userId) {
      return NextResponse.json({ error: "Only this token's creator can set up its DAO." }, { status: 403 });
    }

    const votingPeriodSeconds = Math.round(Number(votingPeriodDays) * 86400);
    if (!Number.isFinite(votingPeriodSeconds) || votingPeriodSeconds < MIN_VOTING_PERIOD_SECONDS || votingPeriodSeconds > MAX_VOTING_PERIOD_SECONDS) {
      return NextResponse.json({ error: "Voting period must be between 1 hour and 90 days." }, { status: 400 });
    }

    let decimalMultiplier = BigInt(1);
    for (let i = 0; i < launchedToken.decimals; i += 1) decimalMultiplier *= BigInt(10);

    const quorumStr = typeof quorum === "string" ? quorum.trim() : typeof quorum === "number" ? String(Math.trunc(quorum)) : "";
    if (!/^\d+$/.test(quorumStr) || quorumStr.length > 20) {
      return NextResponse.json({ error: "Invalid quorum." }, { status: 400 });
    }
    const thresholdStr = typeof proposalThreshold === "string" ? proposalThreshold.trim() : typeof proposalThreshold === "number" ? String(Math.trunc(proposalThreshold)) : "";
    if (!/^\d+$/.test(thresholdStr) || thresholdStr.length > 20) {
      return NextResponse.json({ error: "Invalid proposal threshold." }, { status: 400 });
    }

    try {
      const dao = await prisma.dao.create({
        data: {
          launchedTokenId,
          name: name.trim(),
          description: typeof description === "string" ? description.trim() || null : null,
          quorumRaw: (BigInt(quorumStr) * decimalMultiplier).toString(),
          proposalThresholdRaw: (BigInt(thresholdStr) * decimalMultiplier).toString(),
          votingPeriodSeconds,
          creatorId: userId,
        },
      });
      return jsonWithDecimalStrings({ dao }, { status: 201 });
    } catch (err: any) {
      if (err?.code === "P2002") {
        return NextResponse.json({ error: "This token already has a DAO." }, { status: 409 });
      }
      throw err;
    }
  } catch (error) {
    console.error("DAO creation error:", error);
    return NextResponse.json({ error: "Failed to create DAO. Please try again." }, { status: 500 });
  }
}
