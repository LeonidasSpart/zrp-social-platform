export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { buildWalletLinkMessage, verifyWalletSignature } from "@/lib/wallet-link";
import { getSplTokenBalanceRaw, computeProposalStatus } from "@/lib/launchpad/dao-service";

const VALID_CHOICES = new Set(["FOR", "AGAINST", "ABSTAIN"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limitCheck = await rateLimit(req, { limit: 20, window: 60, type: "dao-vote" });
    if (!limitCheck.success) return limitCheck.response;

    const { id } = await params;
    const body = await req.json();
    const { walletAddress, signature, choice } = body;

    if (typeof walletAddress !== "string" || !walletAddress) {
      return NextResponse.json({ error: "walletAddress is required." }, { status: 400 });
    }
    if (typeof signature !== "string" || !signature) {
      return NextResponse.json({ error: "signature is required." }, { status: 400 });
    }
    if (typeof choice !== "string" || !VALID_CHOICES.has(choice)) {
      return NextResponse.json({ error: "choice must be one of FOR, AGAINST, ABSTAIN." }, { status: 400 });
    }

    const proposal = await prisma.daoProposal.findUnique({
      where: { id },
      include: { dao: { include: { launchedToken: { select: { mintAddress: true } } } } },
    });
    if (!proposal) {
      return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
    }
    if (!proposal.dao.launchedToken.mintAddress) {
      return NextResponse.json({ error: "This DAO's governance token has not finished minting yet." }, { status: 500 });
    }

    const status = computeProposalStatus(proposal, proposal.dao.quorumRaw);
    if (status !== "ACTIVE") {
      return NextResponse.json({ error: `Voting is closed on this proposal (${status}).` }, { status: 400 });
    }

    const challenge = await prisma.daoVoteChallenge.findUnique({
      where: { proposalId_walletAddress: { proposalId: id, walletAddress } },
    });
    if (!challenge || challenge.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "Vote challenge expired or missing. Request a new one." }, { status: 400 });
    }

    const message = buildWalletLinkMessage(id, challenge.nonce);
    if (!verifyWalletSignature(walletAddress, message, signature)) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
    }

    // Atomically consume the nonce - also what serializes concurrent
    // vote attempts from the same wallet on the same proposal.
    const consumed = await prisma.daoVoteChallenge.deleteMany({
      where: { proposalId: id, walletAddress, nonce: challenge.nonce },
    });
    if (consumed.count === 0) {
      return NextResponse.json({ error: "This vote challenge was already used." }, { status: 409 });
    }

    const weightRaw = await getSplTokenBalanceRaw(walletAddress, proposal.dao.launchedToken.mintAddress);
    if (weightRaw <= BigInt(0)) {
      return NextResponse.json({ error: "This wallet does not hold this DAO's governance token." }, { status: 403 });
    }

    const tallyField = choice === "FOR" ? "forRaw" : choice === "AGAINST" ? "againstRaw" : "abstainRaw";

    try {
      await prisma.$transaction([
        prisma.daoVote.create({
          data: { proposalId: id, voterWalletAddress: walletAddress, choice: choice as "FOR" | "AGAINST" | "ABSTAIN", weightRaw: weightRaw.toString() },
        }),
        prisma.daoProposal.update({
          where: { id },
          data: { [tallyField]: { increment: weightRaw.toString() } },
        }),
      ]);
    } catch (err: any) {
      if (err?.code === "P2002") {
        return NextResponse.json({ error: "This wallet has already voted on this proposal." }, { status: 409 });
      }
      throw err;
    }

    return NextResponse.json({ success: true, choice, weight: weightRaw.toString() });
  } catch (error) {
    console.error("DAO vote error:", error);
    return NextResponse.json({ error: "Failed to record vote. Please try again." }, { status: 500 });
  }
}
