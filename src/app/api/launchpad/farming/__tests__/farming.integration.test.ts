import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";

/*
 * Integration coverage for the liquidity farming trust boundary against
 * a real Postgres - same shape as the fungible staking suite, plus the
 * one thing genuinely new here: pool creation requires a verified
 * wallet rather than "own the underlying token" (there's no ZRP-minted
 * token to own - the staked asset is an external LP mint).
 * verifySplTransferToPlatform and executeStakingPayout are both mocked
 * (no real RPC call); reserveFarmingRewardFromPool/refundFarmingRewardToPool
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
      "x-forwarded-for": `10.${(ipCounter >> 8) & 255}.${ipCounter & 255}.14`,
    },
    body: JSON.stringify(body),
  });
}

function asUser(userId: string) {
  getVerifiedToken.mockResolvedValue({ id: userId });
}

function validDeposit(overrides: Partial<{ rawAmount: bigint; from: string }> = {}) {
  return { valid: true, rawAmount: BigInt("1000000000"), from: "FarmerWalletPlaceholder111111111", ...overrides };
}

function poolBody(overrides: Record<string, unknown> = {}) {
  return {
    lpMintAddress: bs58.encode(nacl.sign.keyPair().publicKey),
    lpTokenName: "Test LP Token",
    lpTokenSymbol: "TESTLP",
    lpDecimals: 9,
    apyBasisPoints: 1000,
    lockDays: 0,
    minStake: "1",
    ...overrides,
  };
}

describe.skipIf(!hasRealDatabaseUrl)("Farming pools/positions (integration, real Postgres)", () => {
  const userIds: string[] = [];
  const tokenIds: string[] = [];
  const poolIds: string[] = [];
  const positionIds: string[] = [];

  async function createUser(label: string, verifiedSolanaWallet?: string) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${randomUUID().slice(0, 8)}@farmingtest.example`,
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
        name: "Farming Reward Token",
        symbol: "FARM",
        imageUrl: "https://uploadthing.com/f/abc",
        supply: "1000000000000",
        decimals: 9,
        feeAmount: "15",
        feeTransactionId: `tx-fee-${randomUUID()}`,
        mintAddress: `MintFarm${randomUUID().slice(0, 8)}`,
        status: "COMPLETED",
        creatorId,
      },
    });
    tokenIds.push(token.id);
    return token;
  }

  afterAll(async () => {
    await prisma.farmingPosition.deleteMany({ where: { id: { in: positionIds } } });
    await prisma.farmingRewardDeposit.deleteMany({ where: { poolId: { in: poolIds } } });
    await prisma.consumedPaymentTransaction.deleteMany({ where: { paymentId: { in: [...poolIds, ...positionIds] } } });
    await prisma.farmingPool.deleteMany({ where: { id: { in: poolIds } } });
    await prisma.launchedToken.deleteMany({ where: { id: { in: tokenIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  beforeEach(() => {
    getVerifiedToken.mockReset();
    verifySplTransferToPlatform.mockReset();
    executeStakingPayout.mockReset();
  });

  it("rejects pool creation from a user with no verified wallet (403) - there's no 'own the token' check possible for an external LP mint", async () => {
    const owner = await createUser("farmpoolowner1");
    const rewardToken = await createRewardToken(owner.id);
    asUser(owner.id);

    const res = await createPool(req("https://zrp.one/api/launchpad/farming/pools", poolBody({ rewardTokenId: rewardToken.id })));
    expect(res.status).toBe(403);
  });

  it("happy path: a verified-wallet user can open a farming pool for any LP mint", async () => {
    const owner = await createUser("farmpoolowner2", "OwnerWalletPlaceholder1111111111");
    const rewardToken = await createRewardToken(owner.id);
    asUser(owner.id);

    const res = await createPool(req("https://zrp.one/api/launchpad/farming/pools", poolBody({ rewardTokenId: rewardToken.id, apyBasisPoints: 2000 })));
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.pool.apyBasisPoints).toBe(2000);
    poolIds.push(data.pool.id);
  });

  it("rejects pool funding from someone other than the pool's creator (403)", async () => {
    const owner = await createUser("farmpoolowner3", "OwnerWalletPlaceholder2222222222");
    const rewardToken = await createRewardToken(owner.id);
    asUser(owner.id);
    const createRes = await createPool(req("https://zrp.one/api/launchpad/farming/pools", poolBody({ rewardTokenId: rewardToken.id })));
    const { pool } = await createRes.json();
    poolIds.push(pool.id);

    const stranger = await createUser("farmstranger1", "StrangerWalletPlaceholder333333");
    asUser(stranger.id);
    const res = await fundPool(req(`https://zrp.one/api/launchpad/farming/pools/${pool.id}/fund`, { amount: "100", transactionId: `tx-${randomUUID()}` }), {
      params: Promise.resolve({ id: pool.id }),
    });
    expect(res.status).toBe(403);
  });

  it("happy path: creator funds the pool's reward reserve", async () => {
    const owner = await createUser("farmpoolowner4", "FunderWalletPlaceholder4444444444");
    const rewardToken = await createRewardToken(owner.id);
    asUser(owner.id);
    const createRes = await createPool(req("https://zrp.one/api/launchpad/farming/pools", poolBody({ rewardTokenId: rewardToken.id })));
    const { pool } = await createRes.json();
    poolIds.push(pool.id);

    verifySplTransferToPlatform.mockResolvedValue(
      validDeposit({ rawAmount: BigInt("100000000000"), from: "FunderWalletPlaceholder4444444444" })
    );
    const res = await fundPool(req(`https://zrp.one/api/launchpad/farming/pools/${pool.id}/fund`, { amount: "100", transactionId: `tx-${randomUUID()}` }), {
      params: Promise.resolve({ id: pool.id }),
    });
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.pool.rewardReserveRaw).toBe("100000000000");
  });

  it("rejects opening a stake whose deposit wasn't sent from the claimed wallet (400)", async () => {
    const owner = await createUser("farmpoolowner5", "OwnerWalletPlaceholder5555555555");
    const rewardToken = await createRewardToken(owner.id);
    asUser(owner.id);
    const createRes = await createPool(req("https://zrp.one/api/launchpad/farming/pools", poolBody({ rewardTokenId: rewardToken.id })));
    const { pool } = await createRes.json();
    poolIds.push(pool.id);

    verifySplTransferToPlatform.mockResolvedValue(validDeposit({ from: "ActualSenderWallet333333333333333" }));
    const claimedWallet = bs58.encode(nacl.sign.keyPair().publicKey);
    const res = await openPosition(
      req("https://zrp.one/api/launchpad/farming/positions", {
        poolId: pool.id,
        walletAddress: claimedWallet,
        amount: "1",
        depositTransactionId: `tx-${randomUUID()}`,
      })
    );
    expect(res.status).toBe(400);
  });

  it("happy path: opens a position, increments pool.totalStakedRaw", async () => {
    const owner = await createUser("farmpoolowner6", "OwnerWalletPlaceholder6666666666");
    const rewardToken = await createRewardToken(owner.id);
    asUser(owner.id);
    const createRes = await createPool(req("https://zrp.one/api/launchpad/farming/pools", poolBody({ rewardTokenId: rewardToken.id })));
    const { pool } = await createRes.json();
    poolIds.push(pool.id);

    const stakerKeypair = nacl.sign.keyPair();
    const staker = bs58.encode(stakerKeypair.publicKey);
    verifySplTransferToPlatform.mockResolvedValue(validDeposit({ from: staker }));
    const res = await openPosition(
      req("https://zrp.one/api/launchpad/farming/positions", { poolId: pool.id, walletAddress: staker, amount: "1", depositTransactionId: `tx-${randomUUID()}` })
    );
    const data = await res.json();
    expect(res.status).toBe(201);
    positionIds.push(data.position.id);

    const updatedPool = await prisma.farmingPool.findUnique({ where: { id: pool.id } });
    expect(updatedPool?.totalStakedRaw.toString()).toBe("1000000000");
  });

  it("claim: unstake succeeds once the lock has elapsed, pays LP principal + reward (different mints), and closes the position", async () => {
    const owner = await createUser("farmpoolowner7", "FunderWalletPlaceholder7777777777");
    const rewardToken = await createRewardToken(owner.id);
    asUser(owner.id);
    const createRes = await createPool(
      req("https://zrp.one/api/launchpad/farming/pools", poolBody({ rewardTokenId: rewardToken.id, apyBasisPoints: 1000, lockDays: 0 }))
    );
    const { pool } = await createRes.json();
    poolIds.push(pool.id);

    verifySplTransferToPlatform.mockResolvedValue(
      validDeposit({ rawAmount: BigInt("1000000000000"), from: "FunderWalletPlaceholder7777777777" })
    );
    await fundPool(req(`https://zrp.one/api/launchpad/farming/pools/${pool.id}/fund`, { amount: "1000", transactionId: `tx-${randomUUID()}` }), {
      params: Promise.resolve({ id: pool.id }),
    });

    const stakerKeypair = nacl.sign.keyPair();
    const staker = bs58.encode(stakerKeypair.publicKey);
    verifySplTransferToPlatform.mockResolvedValue(validDeposit({ from: staker, rawAmount: BigInt("1000000000000") }));
    const openRes = await openPosition(
      req("https://zrp.one/api/launchpad/farming/positions", { poolId: pool.id, walletAddress: staker, amount: "1000", depositTransactionId: `tx-${randomUUID()}` })
    );
    const { position } = await openRes.json();
    positionIds.push(position.id);

    // Age the position so a non-zero reward has actually accrued (zero
    // time elapsed at a mere 10% APY would otherwise round down to 0,
    // and the route correctly skips a second payout for a zero reward).
    await prisma.farmingPosition.update({ where: { id: position.id }, data: { stakedAt: new Date(Date.now() - 365 * 24 * 3600 * 1000) } });

    executeStakingPayout.mockResolvedValue({ success: true, signature: `payout-tx-${randomUUID()}` });

    const challengeRes = await claimChallenge(req(`https://zrp.one/api/launchpad/farming/positions/${position.id}/claim-challenge`, {}), {
      params: Promise.resolve({ id: position.id }),
    });
    const { message } = await challengeRes.json();
    const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), stakerKeypair.secretKey));

    const res = await claim(
      req(`https://zrp.one/api/launchpad/farming/positions/${position.id}/claim`, { walletAddress: staker, signature, unstakePrincipal: true }),
      { params: Promise.resolve({ id: position.id }) }
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.unstaked).toBe(true);
    expect(data.principal).toBe("1000000000000");
    // Two independent payouts: the LP principal, and the reward token.
    expect(executeStakingPayout).toHaveBeenCalledTimes(2);

    const finalPosition = await prisma.farmingPosition.findUnique({ where: { id: position.id } });
    expect(finalPosition?.status).toBe("UNSTAKED");

    const finalPool = await prisma.farmingPool.findUnique({ where: { id: pool.id } });
    expect(finalPool?.totalStakedRaw.toString()).toBe("0");
  });

  it("claim: an unfunded pool refuses a reward payout rather than paying from nothing (400)", async () => {
    const owner = await createUser("farmpoolowner8", "OwnerWalletPlaceholder8888888888");
    const rewardToken = await createRewardToken(owner.id);
    asUser(owner.id);
    // High APY, no funding at all - deliberately would accrue real reward.
    const createRes = await createPool(
      req("https://zrp.one/api/launchpad/farming/pools", poolBody({ rewardTokenId: rewardToken.id, apyBasisPoints: 100000, lockDays: 0 }))
    );
    const { pool } = await createRes.json();
    poolIds.push(pool.id);

    const stakerKeypair = nacl.sign.keyPair();
    const staker = bs58.encode(stakerKeypair.publicKey);
    verifySplTransferToPlatform.mockResolvedValue(validDeposit({ from: staker, rawAmount: BigInt("1000000000000") }));
    const openRes = await openPosition(
      req("https://zrp.one/api/launchpad/farming/positions", { poolId: pool.id, walletAddress: staker, amount: "1000", depositTransactionId: `tx-${randomUUID()}` })
    );
    const { position } = await openRes.json();
    positionIds.push(position.id);

    // Manually age the position so real time-based reward has accrued,
    // without needing the test to actually sleep.
    await prisma.farmingPosition.update({ where: { id: position.id }, data: { stakedAt: new Date(Date.now() - 365 * 24 * 3600 * 1000) } });

    const challengeRes = await claimChallenge(req(`https://zrp.one/api/launchpad/farming/positions/${position.id}/claim-challenge`, {}), {
      params: Promise.resolve({ id: position.id }),
    });
    const { message } = await challengeRes.json();
    const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), stakerKeypair.secretKey));

    const res = await claim(req(`https://zrp.one/api/launchpad/farming/positions/${position.id}/claim`, { walletAddress: staker, signature }), {
      params: Promise.resolve({ id: position.id }),
    });
    expect(res.status).toBe(400);
    expect(executeStakingPayout).not.toHaveBeenCalled();
  });
});
