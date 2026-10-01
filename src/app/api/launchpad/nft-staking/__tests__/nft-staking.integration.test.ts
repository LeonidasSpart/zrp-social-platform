import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";

/*
 * Integration coverage for the NFT staking trust boundary against a
 * real Postgres - same shape as the fungible staking suite.
 * verifySplTransferToPlatform and executeStakingPayout are both mocked
 * (no real RPC call); reserveNftRewardFromPool/refundNftRewardToPool
 * are left real so the atomic reward-reserve guard is genuinely
 * exercised against Postgres, not assumed.
 */
const { getVerifiedToken, verifySplTransferToPlatform, executeStakingPayout } = vi.hoisted(() => ({
  getVerifiedToken: vi.fn(),
  verifySplTransferToPlatform: vi.fn(),
  executeStakingPayout: vi.fn(),
}));
vi.mock("@/lib/auth-guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-guards")>();
  return { ...actual, getVerifiedToken };
});
vi.mock("@/lib/launchpad/spl-transfer-verify", () => ({ verifySplTransferToPlatform }));
vi.mock("@/lib/launchpad/staking-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/launchpad/staking-service")>();
  return { ...actual, executeStakingPayout };
});

import { prisma } from "@/lib/db";
import { POST as createPool } from "../pools/route";
import { POST as fundPool } from "../pools/[id]/fund/route";
import { POST as openPosition } from "../positions/route";
import { POST as claimChallenge } from "../positions/[id]/claim-challenge/route";
import { POST as claim } from "../positions/[id]/claim/route";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

let ipCounter = 1;
function req(url: string, body: unknown) {
  ipCounter += 1;
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `10.${(ipCounter >> 8) & 255}.${ipCounter & 255}.13`,
    },
    body: JSON.stringify(body),
  });
}

function asUser(userId: string) {
  getVerifiedToken.mockResolvedValue({ id: userId });
}

function validDeposit(overrides: Partial<{ rawAmount: bigint; from: string }> = {}) {
  return { valid: true, rawAmount: BigInt(1), from: "NftStakerWalletPlaceholder1111111", ...overrides };
}

describe.skipIf(!hasRealDatabaseUrl)("NFT staking pools/positions (integration, real Postgres)", () => {
  const userIds: string[] = [];
  const tokenIds: string[] = [];
  const nftIds: string[] = [];
  const poolIds: string[] = [];
  const positionIds: string[] = [];

  async function createUser(label: string, verifiedSolanaWallet?: string) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${randomUUID().slice(0, 8)}@nftstakingtest.example`,
        username: `${label}${randomUUID().slice(0, 8)}`.slice(0, 20),
        password: "x",
        verifiedSolanaWallet: verifiedSolanaWallet ?? null,
      },
    });
    userIds.push(user.id);
    return user;
  }

  async function createRewardToken(creatorId: string) {
    const token = await prisma.launchedToken.create({
      data: {
        name: "NFT Stake Reward Token",
        symbol: "NSRT",
        imageUrl: "https://uploadthing.com/f/abc",
        supply: "1000000000000",
        decimals: 9,
        feeAmount: "15",
        feeTransactionId: `tx-fee-${randomUUID()}`,
        mintAddress: `MintReward${randomUUID().slice(0, 8)}`,
        status: "COMPLETED",
        creatorId,
      },
    });
    tokenIds.push(token.id);
    return token;
  }

  async function createNft(creatorId: string, collectionName: string) {
    const nft = await prisma.launchedNft.create({
      data: {
        name: "Test NFT",
        imageUrl: "https://uploadthing.com/f/nft",
        collectionName,
        feeAmount: "5",
        feeTransactionId: `tx-nft-fee-${randomUUID()}`,
        mintAddress: `MintNft${randomUUID().slice(0, 8)}`,
        status: "COMPLETED",
        creatorId,
      },
    });
    nftIds.push(nft.id);
    return nft;
  }

  afterAll(async () => {
    await prisma.nftStakingPosition.deleteMany({ where: { id: { in: positionIds } } });
    await prisma.nftStakingRewardDeposit.deleteMany({ where: { poolId: { in: poolIds } } });
    await prisma.consumedPaymentTransaction.deleteMany({ where: { paymentId: { in: [...poolIds, ...positionIds] } } });
    await prisma.nftStakingPool.deleteMany({ where: { id: { in: poolIds } } });
    await prisma.launchedNft.deleteMany({ where: { id: { in: nftIds } } });
    await prisma.launchedToken.deleteMany({ where: { id: { in: tokenIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  beforeEach(() => {
    getVerifiedToken.mockReset();
    verifySplTransferToPlatform.mockReset();
    executeStakingPayout.mockReset();
  });

  it("rejects a pool creation attempt for a collection the caller never minted into (403)", async () => {
    const realCreator = await createUser("nftpoolowner1");
    const impostor = await createUser("nftpoolimpostor1");
    await createNft(realCreator.id, "Real Collection");
    const rewardToken = await createRewardToken(realCreator.id);
    asUser(impostor.id);

    const res = await createPool(
      req("https://zrp.one/api/launchpad/nft-staking/pools", {
        collectionName: "Real Collection",
        rewardTokenId: rewardToken.id,
        rewardRatePerDay: "1",
        lockDays: 0,
      })
    );
    expect(res.status).toBe(403);
  });

  it("happy path: a creator who minted into a collection can open a pool for it", async () => {
    const owner = await createUser("nftpoolowner2");
    await createNft(owner.id, "My Collection 2");
    const rewardToken = await createRewardToken(owner.id);
    asUser(owner.id);

    const res = await createPool(
      req("https://zrp.one/api/launchpad/nft-staking/pools", {
        collectionName: "My Collection 2",
        rewardTokenId: rewardToken.id,
        rewardRatePerDay: "1",
        lockDays: 30,
      })
    );
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.pool.collectionName).toBe("My Collection 2");
    poolIds.push(data.pool.id);
  });

  it("rejects staking an NFT that doesn't belong to the pool's collection (400)", async () => {
    const owner = await createUser("nftpoolowner3");
    await createNft(owner.id, "Pool Collection 3");
    const rewardToken = await createRewardToken(owner.id);
    asUser(owner.id);
    const createRes = await createPool(
      req("https://zrp.one/api/launchpad/nft-staking/pools", {
        collectionName: "Pool Collection 3",
        rewardTokenId: rewardToken.id,
        rewardRatePerDay: "1",
        lockDays: 0,
      })
    );
    const { pool } = await createRes.json();
    poolIds.push(pool.id);

    // An NFT from a DIFFERENT collection, even by the same creator.
    const wrongNft = await createNft(owner.id, "Some Other Collection");

    const stakerKeypair = nacl.sign.keyPair();
    const staker = bs58.encode(stakerKeypair.publicKey);
    verifySplTransferToPlatform.mockResolvedValue(validDeposit({ from: staker }));

    const res = await openPosition(
      req("https://zrp.one/api/launchpad/nft-staking/positions", {
        poolId: pool.id,
        nftId: wrongNft.id,
        walletAddress: staker,
        depositTransactionId: `tx-${randomUUID()}`,
      })
    );
    expect(res.status).toBe(400);
  });

  it("rejects opening a stake whose deposit wasn't sent from the claimed wallet (400)", async () => {
    const owner = await createUser("nftpoolowner4");
    const nft = await createNft(owner.id, "Pool Collection 4");
    const rewardToken = await createRewardToken(owner.id);
    asUser(owner.id);
    const createRes = await createPool(
      req("https://zrp.one/api/launchpad/nft-staking/pools", {
        collectionName: "Pool Collection 4",
        rewardTokenId: rewardToken.id,
        rewardRatePerDay: "1",
        lockDays: 0,
      })
    );
    const { pool } = await createRes.json();
    poolIds.push(pool.id);

    verifySplTransferToPlatform.mockResolvedValue(validDeposit({ from: "ActualSenderWallet333333333333333" }));
    const claimedWallet = bs58.encode(nacl.sign.keyPair().publicKey);
    const res = await openPosition(
      req("https://zrp.one/api/launchpad/nft-staking/positions", {
        poolId: pool.id,
        nftId: nft.id,
        walletAddress: claimedWallet,
        depositTransactionId: `tx-${randomUUID()}`,
      })
    );
    expect(res.status).toBe(400);
  });

  it("happy path: opens a position when exactly 1 raw unit of the NFT's own mint is deposited", async () => {
    const owner = await createUser("nftpoolowner5");
    const nft = await createNft(owner.id, "Pool Collection 5");
    const rewardToken = await createRewardToken(owner.id);
    asUser(owner.id);
    const createRes = await createPool(
      req("https://zrp.one/api/launchpad/nft-staking/pools", {
        collectionName: "Pool Collection 5",
        rewardTokenId: rewardToken.id,
        rewardRatePerDay: "1",
        lockDays: 0,
      })
    );
    const { pool } = await createRes.json();
    poolIds.push(pool.id);

    const stakerKeypair = nacl.sign.keyPair();
    const staker = bs58.encode(stakerKeypair.publicKey);
    verifySplTransferToPlatform.mockResolvedValue(validDeposit({ from: staker }));
    const res = await openPosition(
      req("https://zrp.one/api/launchpad/nft-staking/positions", {
        poolId: pool.id,
        nftId: nft.id,
        walletAddress: staker,
        depositTransactionId: `tx-${randomUUID()}`,
      })
    );
    const data = await res.json();
    expect(res.status).toBe(201);
    positionIds.push(data.position.id);
    expect(data.position.nftId).toBe(nft.id);
  });

  it("unstake succeeds once the lock has elapsed, pays the NFT back plus any accrued reward, and closes the position", async () => {
    const owner = await createUser("nftpoolowner6", "FunderWalletPlaceholder6666666666");
    const nft = await createNft(owner.id, "Pool Collection 6");
    const rewardToken = await createRewardToken(owner.id);
    asUser(owner.id);
    const createRes = await createPool(
      req("https://zrp.one/api/launchpad/nft-staking/pools", {
        collectionName: "Pool Collection 6",
        rewardTokenId: rewardToken.id,
        rewardRatePerDay: "1",
        lockDays: 0,
      })
    );
    const { pool } = await createRes.json();
    poolIds.push(pool.id);

    verifySplTransferToPlatform.mockResolvedValue(
      validDeposit({ rawAmount: BigInt("1000000000000"), from: "FunderWalletPlaceholder6666666666" })
    );
    await fundPool(req(`https://zrp.one/api/launchpad/nft-staking/pools/${pool.id}/fund`, { amount: "1000", transactionId: `tx-${randomUUID()}` }), {
      params: Promise.resolve({ id: pool.id }),
    });

    const stakerKeypair = nacl.sign.keyPair();
    const staker = bs58.encode(stakerKeypair.publicKey);
    verifySplTransferToPlatform.mockResolvedValue(validDeposit({ from: staker }));
    const openRes = await openPosition(
      req("https://zrp.one/api/launchpad/nft-staking/positions", {
        poolId: pool.id,
        nftId: nft.id,
        walletAddress: staker,
        depositTransactionId: `tx-${randomUUID()}`,
      })
    );
    const { position } = await openRes.json();
    positionIds.push(position.id);

    // Age the position so a non-zero reward has actually accrued.
    await prisma.nftStakingPosition.update({ where: { id: position.id }, data: { stakedAt: new Date(Date.now() - 86400 * 1000) } });

    executeStakingPayout.mockResolvedValue({ success: true, signature: `payout-tx-${randomUUID()}` });

    const challengeRes = await claimChallenge(req(`https://zrp.one/api/launchpad/nft-staking/positions/${position.id}/claim-challenge`, {}), {
      params: Promise.resolve({ id: position.id }),
    });
    const { message } = await challengeRes.json();
    const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), stakerKeypair.secretKey));

    const res = await claim(
      req(`https://zrp.one/api/launchpad/nft-staking/positions/${position.id}/claim`, { walletAddress: staker, signature, unstakeNft: true }),
      { params: Promise.resolve({ id: position.id }) }
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.unstaked).toBe(true);
    expect(data.reward).toBe("1000000000"); // 1 full day at rate 1000000000/day (with decimals)
    // Two independent payouts: the NFT itself, and the reward token.
    expect(executeStakingPayout).toHaveBeenCalledTimes(2);

    const finalPosition = await prisma.nftStakingPosition.findUnique({ where: { id: position.id } });
    expect(finalPosition?.status).toBe("UNSTAKED");
  });

  it("an unfunded pool refuses the unstake payout rather than paying reward from nothing (400), leaving the NFT unmoved", async () => {
    const owner = await createUser("nftpoolowner7");
    const nft = await createNft(owner.id, "Pool Collection 7");
    const rewardToken = await createRewardToken(owner.id);
    asUser(owner.id);
    const createRes = await createPool(
      req("https://zrp.one/api/launchpad/nft-staking/pools", {
        collectionName: "Pool Collection 7",
        rewardTokenId: rewardToken.id,
        rewardRatePerDay: "1000000000000", // deliberately huge, never funded
        lockDays: 0,
      })
    );
    const { pool } = await createRes.json();
    poolIds.push(pool.id);

    const stakerKeypair = nacl.sign.keyPair();
    const staker = bs58.encode(stakerKeypair.publicKey);
    verifySplTransferToPlatform.mockResolvedValue(validDeposit({ from: staker }));
    const openRes = await openPosition(
      req("https://zrp.one/api/launchpad/nft-staking/positions", {
        poolId: pool.id,
        nftId: nft.id,
        walletAddress: staker,
        depositTransactionId: `tx-${randomUUID()}`,
      })
    );
    const { position } = await openRes.json();
    positionIds.push(position.id);

    await prisma.nftStakingPosition.update({ where: { id: position.id }, data: { stakedAt: new Date(Date.now() - 86400 * 1000) } });

    const challengeRes = await claimChallenge(req(`https://zrp.one/api/launchpad/nft-staking/positions/${position.id}/claim-challenge`, {}), {
      params: Promise.resolve({ id: position.id }),
    });
    const { message } = await challengeRes.json();
    const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), stakerKeypair.secretKey));

    const res = await claim(
      req(`https://zrp.one/api/launchpad/nft-staking/positions/${position.id}/claim`, { walletAddress: staker, signature, unstakeNft: true }),
      { params: Promise.resolve({ id: position.id }) }
    );
    expect(res.status).toBe(400);
    expect(executeStakingPayout).not.toHaveBeenCalled();

    const finalPosition = await prisma.nftStakingPosition.findUnique({ where: { id: position.id } });
    expect(finalPosition?.status).toBe("ACTIVE");
  });
});
