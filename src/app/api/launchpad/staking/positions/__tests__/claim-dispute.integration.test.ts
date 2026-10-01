import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { Keypair } from "@solana/web3.js";

/*
 * Integration coverage, against a real Postgres, for the double-payout
 * fix: executeStakingPayout is mocked to simulate the three on-chain
 * outcomes the claim route must react to differently (success,
 * definite failure, ambiguous), and verifyWalletSignature is mocked
 * (real signature verification is covered elsewhere) so this can focus
 * on the trust boundary that actually matters here - that an ambiguous
 * payout outcome never lets a second claim through and never refunds a
 * reservation that may have already been spent on-chain.
 */
const { verifyWalletSignature, executeStakingPayout, refundRewardToPool } = vi.hoisted(() => ({
  verifyWalletSignature: vi.fn().mockReturnValue(true),
  executeStakingPayout: vi.fn(),
  refundRewardToPool: vi.fn(),
}));
vi.mock("@/lib/wallet-link", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/wallet-link")>();
  return { ...actual, verifyWalletSignature };
});
vi.mock("@/lib/launchpad/staking-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/launchpad/staking-service")>();
  return { ...actual, executeStakingPayout, refundRewardToPool };
});
// This suite is about the claim/dispute trust boundary, not rate
// limiting; without a real Redis available, checkRateLimitKey's
// connect-and-retry path adds multi-second delays per call (4 rate-
// limited calls per test), which both risks exceeding the test timeout
// and - worse - can let a slow call from one test resolve mid-way
// through the next, double-invoking a shared mock. Bypassing it here
// keeps this test deterministic; rate-limit behavior itself has its own
// dedicated coverage elsewhere.
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, rateLimit: vi.fn().mockResolvedValue({ success: true }) };
});

import { prisma } from "@/lib/db";
import { POST as claimChallenge } from "../[id]/claim-challenge/route";
import { POST as claim } from "../[id]/claim/route";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

let ipCounter = 1;
function req(url: string, body: unknown) {
  ipCounter += 1;
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `10.${(ipCounter >> 8) & 255}.${ipCounter & 255}.77` },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!hasRealDatabaseUrl)("staking claim route: ambiguous-payout dispute handling (integration, real Postgres)", () => {
  const userIds: string[] = [];
  const tokenIds: string[] = [];
  const poolIds: string[] = [];
  const positionIds: string[] = [];

  const ONE_YEAR_MS = 365 * 24 * 3600 * 1000;

  // amountRaw * 1000bps(10%) over a full year = exactly 100_000_000 raw
  // units accrued - stakedAt is backdated a year so the reward-only claim
  // path below has something real to claim (stakedAt defaults to "now",
  // which would make computeClaimableRewardRaw() return 0 and never even
  // reach executeStakingPayout).
  async function setupPosition(rewardReserveRaw = "200000000") {
    const user = await prisma.user.create({
      data: { email: `t-${randomUUID().slice(0, 8)}@disputetest.example`, username: `t${randomUUID().slice(0, 8)}`.slice(0, 20), password: "x" },
    });
    userIds.push(user.id);

    const token = await prisma.launchedToken.create({
      data: {
        mintAddress: Keypair.generate().publicKey.toBase58(),
        name: "Dispute Test",
        symbol: "DISP",
        imageUrl: "https://uploadthing.com/f/x",
        supply: "1000000000",
        decimals: 9,
        revokeMint: true,
        revokeFreeze: true,
        revokeUpdate: false,
        feeAmount: 15,
        feeTransactionId: `tx-${randomUUID()}`,
        status: "COMPLETED",
      },
    });
    tokenIds.push(token.id);

    const pool = await prisma.stakingPool.create({
      data: {
        launchedTokenId: token.id,
        apyBasisPoints: 1000,
        lockSeconds: 0,
        minStakeRaw: "1",
        rewardReserveRaw,
      },
    });
    poolIds.push(pool.id);

    const walletAddress = Keypair.generate().publicKey.toBase58();
    const position = await prisma.stakingPosition.create({
      data: {
        poolId: pool.id,
        userWalletAddress: walletAddress,
        amountRaw: "1000000000",
        depositTransactionId: `tx-${randomUUID()}`,
        stakedAt: new Date(Date.now() - ONE_YEAR_MS),
        unlocksAt: new Date(Date.now() - 1000), // already unlocked
      },
    });
    positionIds.push(position.id);

    return { position, walletAddress, pool };
  }

  async function getChallengeSignature(id: string, walletAddress: string) {
    const res = await claimChallenge(req(`https://zrp.one/api/launchpad/staking/positions/${id}/claim-challenge`, {}), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(200);
    // Signature content doesn't matter - verifyWalletSignature is mocked true.
    return { walletAddress, signature: "mock-signature" };
  }

  afterAll(async () => {
    await prisma.stakingPosition.deleteMany({ where: { id: { in: positionIds } } });
    await prisma.stakingPool.deleteMany({ where: { id: { in: poolIds } } });
    await prisma.launchedToken.deleteMany({ where: { id: { in: tokenIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  beforeEach(() => {
    verifyWalletSignature.mockReset().mockReturnValue(true);
    executeStakingPayout.mockReset();
    refundRewardToPool.mockReset();
  });

  it("ambiguous payout: marks the position disputed, does NOT refund the reserve, and blocks all further claim-challenges", async () => {
    const { position, walletAddress, pool } = await setupPosition();
    const { signature } = await getChallengeSignature(position.id, walletAddress);

    executeStakingPayout.mockResolvedValue({ success: false, ambiguous: true, signature: "ambiguous-sig-123" });

    const res = await claim(req(`https://zrp.one/api/launchpad/staking/positions/${position.id}/claim`, { walletAddress, signature }), {
      params: Promise.resolve({ id: position.id }),
    });
    const data = await res.json();
    expect(res.status).toBe(409);
    expect(data.disputed).toBe(true);
    expect(refundRewardToPool).not.toHaveBeenCalled();

    const row = await prisma.stakingPosition.findUnique({ where: { id: position.id } });
    expect(row?.disputedTransactionId).toBe("ambiguous-sig-123");
    expect(row?.status).toBe("ACTIVE"); // reward-only claim, principal untouched

    const reservePoolRow = await prisma.stakingPool.findUnique({ where: { id: pool.id } });
    expect(reservePoolRow?.rewardReserveRaw.toString()).not.toBe("200000000"); // stayed decremented, not refunded

    // The actual bug this closes: a second claim-challenge must now be
    // refused outright, so no second payout can ever be attempted
    // against a claim whose real outcome is unknown.
    const secondChallenge = await claimChallenge(
      req(`https://zrp.one/api/launchpad/staking/positions/${position.id}/claim-challenge`, {}),
      { params: Promise.resolve({ id: position.id }) }
    );
    expect(secondChallenge.status).toBe(409);
  });

  it("definite on-chain failure: refunds the reserve and leaves the position claimable again (safe, since nothing moved)", async () => {
    const { position, walletAddress } = await setupPosition();
    const { signature } = await getChallengeSignature(position.id, walletAddress);

    executeStakingPayout.mockResolvedValue({ success: false, ambiguous: false, error: "Transaction failed on-chain" });

    const res = await claim(req(`https://zrp.one/api/launchpad/staking/positions/${position.id}/claim`, { walletAddress, signature }), {
      params: Promise.resolve({ id: position.id }),
    });
    expect(res.status).toBe(502);
    expect(refundRewardToPool).toHaveBeenCalledTimes(1);

    const row = await prisma.stakingPosition.findUnique({ where: { id: position.id } });
    expect(row?.disputedTransactionId).toBeNull();

    // Not disputed - a fresh claim-challenge must still work normally.
    const secondChallenge = await claimChallenge(
      req(`https://zrp.one/api/launchpad/staking/positions/${position.id}/claim-challenge`, {}),
      { params: Promise.resolve({ id: position.id }) }
    );
    expect(secondChallenge.status).toBe(200);
  });

  it("success: pays out normally and never touches disputedTransactionId", async () => {
    const { position, walletAddress } = await setupPosition();
    const { signature } = await getChallengeSignature(position.id, walletAddress);

    executeStakingPayout.mockResolvedValue({ success: true, signature: "real-sig-456" });

    const res = await claim(req(`https://zrp.one/api/launchpad/staking/positions/${position.id}/claim`, { walletAddress, signature }), {
      params: Promise.resolve({ id: position.id }),
    });
    expect(res.status).toBe(200);

    const row = await prisma.stakingPosition.findUnique({ where: { id: position.id } });
    expect(row?.disputedTransactionId).toBeNull();
  });
});
