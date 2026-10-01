import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";

/*
 * Integration coverage for ZRP Launchpad phase 8 (DAO governance) against
 * a real Postgres. getSplTokenBalanceRaw (the one function here that
 * talks to Solana RPC) is mocked; computeProposalStatus is left real
 * (pure function) so the time/quorum/cancellation state machine is
 * genuinely exercised, not assumed.
 */
const { getVerifiedToken, getSplTokenBalanceRaw } = vi.hoisted(() => ({
  getVerifiedToken: vi.fn(),
  getSplTokenBalanceRaw: vi.fn(),
}));
vi.mock("@/lib/auth-guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-guards")>();
  return { ...actual, getVerifiedToken };
});
vi.mock("@/lib/launchpad/dao-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/launchpad/dao-service")>();
  return { ...actual, getSplTokenBalanceRaw };
});

import { prisma } from "@/lib/db";
import { POST as createDao } from "../route";
import { POST as createProposal } from "../[id]/proposals/route";
import { POST as voteChallenge } from "../proposals/[id]/vote-challenge/route";
import { POST as vote } from "../proposals/[id]/vote/route";
import { POST as cancelProposal } from "../proposals/[id]/cancel/route";
import { GET as getProposal } from "../proposals/[id]/route";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

let ipCounter = 1;
function req(url: string, body: unknown) {
  ipCounter += 1;
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `10.${(ipCounter >> 8) & 255}.${ipCounter & 255}.21`,
    },
    body: JSON.stringify(body),
  });
}

function asUser(userId: string) {
  getVerifiedToken.mockResolvedValue({ id: userId });
}

function daoBody(launchedTokenId: string, overrides: Record<string, unknown> = {}) {
  return {
    launchedTokenId,
    name: "Test DAO",
    quorum: "100",
    proposalThreshold: "10",
    votingPeriodDays: 3,
    ...overrides,
  };
}

async function signChallengeMessage(messageRoute: Response, keypair: nacl.SignKeyPair) {
  const { message } = await messageRoute.json();
  return bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), keypair.secretKey));
}

describe.skipIf(!hasRealDatabaseUrl)("DAO governance (integration, real Postgres)", () => {
  const userIds: string[] = [];
  const tokenIds: string[] = [];
  const daoIds: string[] = [];
  const proposalIds: string[] = [];

  async function createUser(label: string, verifiedSolanaWallet?: string) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${randomUUID().slice(0, 8)}@daotest.example`,
        username: `${label}${randomUUID().slice(0, 8)}`.slice(0, 20),
        password: "x",
        verifiedSolanaWallet: verifiedSolanaWallet ?? null,
      },
    });
    userIds.push(user.id);
    return user;
  }

  async function createGovToken(creatorId: string) {
    const token = await prisma.launchedToken.create({
      data: {
        name: "Governance Token",
        symbol: "GOV",
        imageUrl: "https://uploadthing.com/f/abc",
        supply: "1000000000000",
        decimals: 9,
        feeAmount: "15",
        feeTransactionId: `tx-fee-${randomUUID()}`,
        mintAddress: `MintGov${randomUUID().slice(0, 8)}`,
        status: "COMPLETED",
        creatorId,
      },
    });
    tokenIds.push(token.id);
    return token;
  }

  afterAll(async () => {
    await prisma.daoVote.deleteMany({ where: { proposalId: { in: proposalIds } } });
    await prisma.daoVoteChallenge.deleteMany({ where: { proposalId: { in: proposalIds } } });
    await prisma.daoProposal.deleteMany({ where: { id: { in: proposalIds } } });
    await prisma.dao.deleteMany({ where: { id: { in: daoIds } } });
    await prisma.launchedToken.deleteMany({ where: { id: { in: tokenIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  beforeEach(() => {
    getVerifiedToken.mockReset();
    getSplTokenBalanceRaw.mockReset();
  });

  it("rejects DAO creation from someone other than the token's creator (403)", async () => {
    const owner = await createUser("daotokenowner1");
    const govToken = await createGovToken(owner.id);
    const stranger = await createUser("daostranger1");
    asUser(stranger.id);

    const res = await createDao(req("https://zrp.one/api/launchpad/dao", daoBody(govToken.id)));
    expect(res.status).toBe(403);
  });

  it("happy path: the token's creator stands up its DAO", async () => {
    const owner = await createUser("daotokenowner2");
    const govToken = await createGovToken(owner.id);
    asUser(owner.id);

    const res = await createDao(req("https://zrp.one/api/launchpad/dao", daoBody(govToken.id)));
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.dao.quorumRaw).toBe("100000000000");
    daoIds.push(data.dao.id);
  });

  it("rejects a second DAO for the same token (409 - one DAO per governance token)", async () => {
    const owner = await createUser("daotokenowner3");
    const govToken = await createGovToken(owner.id);
    asUser(owner.id);
    const first = await createDao(req("https://zrp.one/api/launchpad/dao", daoBody(govToken.id)));
    const { dao } = await first.json();
    daoIds.push(dao.id);

    const res = await createDao(req("https://zrp.one/api/launchpad/dao", daoBody(govToken.id)));
    expect(res.status).toBe(409);
  });

  it("rejects opening a proposal from a wallet below the proposal threshold (403)", async () => {
    const owner = await createUser("daotokenowner4", "DaoOwnerWallet1111111111111111111");
    const govToken = await createGovToken(owner.id);
    asUser(owner.id);
    const daoRes = await createDao(req("https://zrp.one/api/launchpad/dao", daoBody(govToken.id)));
    const { dao } = await daoRes.json();
    daoIds.push(dao.id);

    getSplTokenBalanceRaw.mockResolvedValue(BigInt("1")); // far below the 10 * 10^9 threshold
    const res = await createProposal(
      req(`https://zrp.one/api/launchpad/dao/${dao.id}/proposals`, { title: "Raise fees", description: "Because reasons." }),
      { params: Promise.resolve({ id: dao.id }) }
    );
    expect(res.status).toBe(403);
  });

  it("happy path: a sufficiently-weighted wallet opens a proposal; a second wallet votes FOR, tipping it to PASSED after voting ends", async () => {
    const owner = await createUser("daotokenowner5", "DaoOwnerWallet2222222222222222222");
    const govToken = await createGovToken(owner.id);
    asUser(owner.id);
    const daoRes = await createDao(req("https://zrp.one/api/launchpad/dao", daoBody(govToken.id, { quorum: "50" })));
    const { dao } = await daoRes.json();
    daoIds.push(dao.id);

    getSplTokenBalanceRaw.mockResolvedValue(BigInt("20000000000")); // 20 tokens, above the 10-token threshold
    const proposalRes = await createProposal(
      req(`https://zrp.one/api/launchpad/dao/${dao.id}/proposals`, { title: "Raise fees", description: "Because reasons." }),
      { params: Promise.resolve({ id: dao.id }) }
    );
    const { proposal } = await proposalRes.json();
    proposalIds.push(proposal.id);
    expect(proposalRes.status).toBe(201);

    const voterKeypair = nacl.sign.keyPair();
    const voterWallet = bs58.encode(voterKeypair.publicKey);
    getSplTokenBalanceRaw.mockResolvedValue(BigInt("60000000000")); // 60 tokens - clears the 50-token quorum alone

    const challengeRes = await voteChallenge(
      req(`https://zrp.one/api/launchpad/dao/proposals/${proposal.id}/vote-challenge`, { walletAddress: voterWallet }),
      { params: Promise.resolve({ id: proposal.id }) }
    );
    const signature = await signChallengeMessage(challengeRes, voterKeypair);

    const voteRes = await vote(
      req(`https://zrp.one/api/launchpad/dao/proposals/${proposal.id}/vote`, { walletAddress: voterWallet, signature, choice: "FOR" }),
      { params: Promise.resolve({ id: proposal.id }) }
    );
    expect(voteRes.status).toBe(200);

    // Age the proposal past its voting period, the same way the farming
    // suite ages a position past its lock - no need to actually sleep
    // out a multi-day voting window.
    await prisma.daoProposal.update({ where: { id: proposal.id }, data: { votingEndsAt: new Date(Date.now() - 1000) } });

    const detailRes = await getProposal(new NextRequest(`https://zrp.one/api/launchpad/dao/proposals/${proposal.id}`), {
      params: Promise.resolve({ id: proposal.id }),
    });
    const { proposal: detail } = await detailRes.json();
    expect(detail.status).toBe("PASSED");
    expect(detail.forRaw).toBe("60000000000");
  });

  it("rejects a second vote from the same wallet on the same proposal (409)", async () => {
    const owner = await createUser("daotokenowner6", "DaoOwnerWallet3333333333333333333");
    const govToken = await createGovToken(owner.id);
    asUser(owner.id);
    const daoRes = await createDao(req("https://zrp.one/api/launchpad/dao", daoBody(govToken.id)));
    const { dao } = await daoRes.json();
    daoIds.push(dao.id);

    getSplTokenBalanceRaw.mockResolvedValue(BigInt("20000000000"));
    const proposalRes = await createProposal(
      req(`https://zrp.one/api/launchpad/dao/${dao.id}/proposals`, { title: "Second thing", description: "Desc." }),
      { params: Promise.resolve({ id: dao.id }) }
    );
    const { proposal } = await proposalRes.json();
    proposalIds.push(proposal.id);

    const voterKeypair = nacl.sign.keyPair();
    const voterWallet = bs58.encode(voterKeypair.publicKey);
    getSplTokenBalanceRaw.mockResolvedValue(BigInt("5000000000"));

    const challenge1 = await voteChallenge(req(`https://zrp.one/api/launchpad/dao/proposals/${proposal.id}/vote-challenge`, { walletAddress: voterWallet }), {
      params: Promise.resolve({ id: proposal.id }),
    });
    const sig1 = await signChallengeMessage(challenge1, voterKeypair);
    const firstVote = await vote(req(`https://zrp.one/api/launchpad/dao/proposals/${proposal.id}/vote`, { walletAddress: voterWallet, signature: sig1, choice: "FOR" }), {
      params: Promise.resolve({ id: proposal.id }),
    });
    expect(firstVote.status).toBe(200);

    const challenge2 = await voteChallenge(req(`https://zrp.one/api/launchpad/dao/proposals/${proposal.id}/vote-challenge`, { walletAddress: voterWallet }), {
      params: Promise.resolve({ id: proposal.id }),
    });
    const sig2 = await signChallengeMessage(challenge2, voterKeypair);
    const secondVote = await vote(req(`https://zrp.one/api/launchpad/dao/proposals/${proposal.id}/vote`, { walletAddress: voterWallet, signature: sig2, choice: "AGAINST" }), {
      params: Promise.resolve({ id: proposal.id }),
    });
    expect(secondVote.status).toBe(409);
  });

  it("rejects cancellation from a wallet that is not the proposer (403), then succeeds for the real proposer", async () => {
    const ownerKeypair = nacl.sign.keyPair();
    const ownerWallet = bs58.encode(ownerKeypair.publicKey);
    const owner = await createUser("daotokenowner7", ownerWallet);
    const govToken = await createGovToken(owner.id);
    asUser(owner.id);
    const daoRes = await createDao(req("https://zrp.one/api/launchpad/dao", daoBody(govToken.id)));
    const { dao } = await daoRes.json();
    daoIds.push(dao.id);

    getSplTokenBalanceRaw.mockResolvedValue(BigInt("20000000000"));
    const proposalRes = await createProposal(
      req(`https://zrp.one/api/launchpad/dao/${dao.id}/proposals`, { title: "Cancel me", description: "Desc." }),
      { params: Promise.resolve({ id: dao.id }) }
    );
    const { proposal } = await proposalRes.json();
    proposalIds.push(proposal.id);
    expect(proposal.proposerWalletAddress).toBe(ownerWallet);

    const strangerKeypair = nacl.sign.keyPair();
    const strangerWallet = bs58.encode(strangerKeypair.publicKey);
    const strangerChallenge = await voteChallenge(req(`https://zrp.one/api/launchpad/dao/proposals/${proposal.id}/vote-challenge`, { walletAddress: strangerWallet }), {
      params: Promise.resolve({ id: proposal.id }),
    });
    const strangerSig = await signChallengeMessage(strangerChallenge, strangerKeypair);
    const strangerCancel = await cancelProposal(
      req(`https://zrp.one/api/launchpad/dao/proposals/${proposal.id}/cancel`, { walletAddress: strangerWallet, signature: strangerSig }),
      { params: Promise.resolve({ id: proposal.id }) }
    );
    expect(strangerCancel.status).toBe(403);

    const ownerChallenge = await voteChallenge(req(`https://zrp.one/api/launchpad/dao/proposals/${proposal.id}/vote-challenge`, { walletAddress: ownerWallet }), {
      params: Promise.resolve({ id: proposal.id }),
    });
    const ownerSig = await signChallengeMessage(ownerChallenge, ownerKeypair);
    const ownerCancel = await cancelProposal(
      req(`https://zrp.one/api/launchpad/dao/proposals/${proposal.id}/cancel`, { walletAddress: ownerWallet, signature: ownerSig }),
      { params: Promise.resolve({ id: proposal.id }) }
    );
    expect(ownerCancel.status).toBe(200);

    const detailRes = await getProposal(new NextRequest(`https://zrp.one/api/launchpad/dao/proposals/${proposal.id}`), {
      params: Promise.resolve({ id: proposal.id }),
    });
    const { proposal: detail } = await detailRes.json();
    expect(detail.status).toBe("CANCELLED");
  });
});
