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
import { getVerifiedWallet } from "@/lib/launchpad/entitlement";
import { getSplTokenBalanceRaw, computeProposalStatus } from "@/lib/launchpad/dao-service";

// ─── GET: a DAO's proposals, cursor-paginated ──────────────────────────
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { cursor, limit } = parseCursorParams(req);

    const limitCheck = await rateLimit(req, { limit: 60, window: 60, type: "dao-proposals-list" });
    if (!limitCheck.success) return limitCheck.response;

    const dao = await prisma.dao.findUnique({ where: { id }, select: { quorumRaw: true } });
    if (!dao) {
      return NextResponse.json({ error: "DAO not found." }, { status: 404 });
    }

    const proposals = await prisma.daoProposal.findMany({
      where: { daoId: id },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const { items, nextCursor } = buildPage(proposals, limit);
    const withStatus = items.map((p) => ({ ...p, status: computeProposalStatus(p, dao.quorumRaw) }));

    return jsonWithDecimalStrings({ proposals: withStatus, nextCursor });
  } catch (error) {
    console.error("Error fetching DAO proposals:", error);
    return NextResponse.json({ error: "Failed to fetch proposals" }, { status: 500 });
  }
}

// ─── POST: open a new proposal - ZRP session + verified wallet required
// to attribute authorship, but voting itself stays fully wallet-native ─
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = token.id as string;

    const limit = await rateLimitByIpAndUser(req, userId, { limit: 10, window: 3600, type: "dao-proposal-create" });
    if (!limit.success) return limit.response;

    const { id } = await params;
    const body = await req.json();
    const { title, description } = body;

    if (typeof title !== "string" || !title.trim() || title.trim().length > 120) {
      return NextResponse.json({ error: "Title is required (max 120 characters)." }, { status: 400 });
    }
    if (typeof description !== "string" || !description.trim() || description.trim().length > 5000) {
      return NextResponse.json({ error: "Description is required (max 5000 characters)." }, { status: 400 });
    }

    const dao = await prisma.dao.findUnique({ where: { id }, include: { launchedToken: { select: { mintAddress: true } } } });
    if (!dao || !dao.launchedToken.mintAddress) {
      return NextResponse.json({ error: "DAO not found." }, { status: 404 });
    }

    const walletAddress = await getVerifiedWallet(userId);
    if (!walletAddress) {
      return NextResponse.json({ error: "Link and verify a Solana wallet in Settings before opening a proposal." }, { status: 403 });
    }

    const balanceRaw = await getSplTokenBalanceRaw(walletAddress, dao.launchedToken.mintAddress);
    const thresholdRaw = BigInt(dao.proposalThresholdRaw.toFixed(0));
    if (balanceRaw < thresholdRaw) {
      return NextResponse.json(
        { error: "Your verified wallet does not hold enough of this DAO's governance token to open a proposal." },
        { status: 403 }
      );
    }

    const votingEndsAt = new Date(Date.now() + dao.votingPeriodSeconds * 1000);

    const proposal = await prisma.daoProposal.create({
      data: {
        daoId: id,
        title: title.trim(),
        description: description.trim(),
        proposerWalletAddress: walletAddress,
        votingEndsAt,
      },
    });

    return jsonWithDecimalStrings({ proposal: { ...proposal, status: "ACTIVE" } }, { status: 201 });
  } catch (error) {
    console.error("DAO proposal creation error:", error);
    return NextResponse.json({ error: "Failed to create proposal. Please try again." }, { status: 500 });
  }
}
