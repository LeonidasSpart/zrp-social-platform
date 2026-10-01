export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { buildWalletLinkMessage, generateWalletLinkNonce } from "@/lib/wallet-link";

function isValidPublicKey(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

/*
 * Public - issues a single-use ed25519 challenge proving ownership of
 * walletAddress, scoped to this proposal. The same proof is accepted by
 * both the vote and cancel routes below; which action it authorizes is
 * decided by that route's own business rules (anyone may vote, only the
 * proposer may cancel), not by the challenge itself.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limitCheck = await rateLimit(req, { limit: 20, window: 60, type: "dao-vote-challenge" });
    if (!limitCheck.success) return limitCheck.response;

    const { id } = await params;
    const body = await req.json();
    const { walletAddress } = body;

    if (!isValidPublicKey(walletAddress)) {
      return NextResponse.json({ error: "A valid walletAddress is required." }, { status: 400 });
    }

    const proposal = await prisma.daoProposal.findUnique({ where: { id }, select: { id: true } });
    if (!proposal) {
      return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
    }

    const { nonce, expiresAt } = generateWalletLinkNonce();
    await prisma.daoVoteChallenge.upsert({
      where: { proposalId_walletAddress: { proposalId: id, walletAddress } },
      create: { proposalId: id, walletAddress, nonce, expiresAt },
      update: { nonce, expiresAt },
    });

    return NextResponse.json({ message: buildWalletLinkMessage(id, nonce) });
  } catch (error) {
    console.error("Error issuing DAO vote challenge:", error);
    return NextResponse.json({ error: "Failed to issue vote challenge" }, { status: 500 });
  }
}
