export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { buildWalletLinkMessage, verifyWalletSignature } from "@/lib/wallet-link";
import { computeProposalStatus } from "@/lib/launchpad/dao-service";

// ─── POST: the proposer withdraws their own proposal before voting ends.
// Uses the same (proposalId, walletAddress) challenge as the vote route -
// see that route's doc comment for why one challenge type covers both. ─
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limitCheck = await rateLimit(req, { limit: 10, window: 60, type: "dao-proposal-cancel" });
    if (!limitCheck.success) return limitCheck.response;

    const { id } = await params;
    const body = await req.json();
    const { walletAddress, signature } = body;

    if (typeof walletAddress !== "string" || !walletAddress) {
      return NextResponse.json({ error: "walletAddress is required." }, { status: 400 });
    }
    if (typeof signature !== "string" || !signature) {
      return NextResponse.json({ error: "signature is required." }, { status: 400 });
    }

    const proposal = await prisma.daoProposal.findUnique({ where: { id }, include: { dao: { select: { quorumRaw: true } } } });
    if (!proposal) {
      return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
    }
    if (proposal.proposerWalletAddress !== walletAddress) {
      return NextResponse.json({ error: "Only the proposer can cancel this proposal." }, { status: 403 });
    }

    const status = computeProposalStatus(proposal, proposal.dao.quorumRaw);
    if (status !== "ACTIVE") {
      return NextResponse.json({ error: `This proposal can no longer be cancelled (${status}).` }, { status: 400 });
    }

    const challenge = await prisma.daoVoteChallenge.findUnique({
      where: { proposalId_walletAddress: { proposalId: id, walletAddress } },
    });
    if (!challenge || challenge.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "Challenge expired or missing. Request a new one." }, { status: 400 });
    }

    const message = buildWalletLinkMessage(id, challenge.nonce);
    if (!verifyWalletSignature(walletAddress, message, signature)) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
    }

    const consumed = await prisma.daoVoteChallenge.deleteMany({
      where: { proposalId: id, walletAddress, nonce: challenge.nonce },
    });
    if (consumed.count === 0) {
      return NextResponse.json({ error: "This challenge was already used." }, { status: 409 });
    }

    const updated = await prisma.daoProposal.updateMany({ where: { id, cancelledAt: null }, data: { cancelledAt: new Date() } });
    if (updated.count === 0) {
      return NextResponse.json({ error: "This proposal was already cancelled." }, { status: 409 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DAO proposal cancel error:", error);
    return NextResponse.json({ error: "Failed to cancel proposal. Please try again." }, { status: 500 });
  }
}
