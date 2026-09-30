import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";

/*
 * Integration coverage for the vesting create/claim trust boundary
 * against a real Postgres. verifySplTransferToPlatform (the deposit
 * verifier) and executeVestingClaim (the actual on-chain transfer) are
 * both mocked - no real RPC call - everything else (auth, rate limiter,
 * signature verification, Prisma, Postgres) is real, including the
 * claim route's actual ed25519 signature check.
 */
const { getVerifiedToken, verifySplTransferToPlatform, executeVestingClaim } = vi.hoisted(() => ({
  getVerifiedToken: vi.fn(),
  verifySplTransferToPlatform: vi.fn(),
  executeVestingClaim: vi.fn(),
}));
vi.mock("@/lib/auth-guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-guards")>();
  return { ...actual, getVerifiedToken };
});
vi.mock("@/lib/launchpad/spl-transfer-verify", () => ({ verifySplTransferToPlatform }));
vi.mock("@/lib/launchpad/vesting-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/launchpad/vesting-service")>();
  return { ...actual, executeVestingClaim };
});

import { prisma } from "@/lib/db";
import { POST as createVesting } from "../route";
import { POST as claimChallenge } from "../[id]/claim-challenge/route";
import { POST as claim } from "../[id]/claim/route";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

let ipCounter = 1;
function req(url: string, body: unknown) {
  ipCounter += 1;
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `10.${(ipCounter >> 8) & 255}.${ipCounter & 255}.11`,
    },
    body: JSON.stringify(body),
  });
}

function asUser(userId: string) {
  getVerifiedToken.mockResolvedValue({ id: userId });
}

function validDeposit(overrides: Partial<{ rawAmount: bigint; from: string }> = {}) {
  return { valid: true, rawAmount: BigInt("1000000000"), from: "CreatorWalletPlaceholder1111111111", ...overrides };
}

describe.skipIf(!hasRealDatabaseUrl)("Vesting create + claim (integration, real Postgres)", () => {
  const userIds: string[] = [];
  const tokenIds: string[] = [];
  const contractIds: string[] = [];

  async function createUser(label: string, verifiedSolanaWallet?: string) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${randomUUID().slice(0, 8)}@vestingtest.example`,
        username: `${label}${randomUUID().slice(0, 8)}`.slice(0, 20),
        password: "x",
        verifiedSolanaWallet: verifiedSolanaWallet ?? null,
      },
    });
    userIds.push(user.id);
    return user;
  }

  async function createToken(creatorId: string) {
    const token = await prisma.launchedToken.create({
      data: {
        name: "Vest Test Token",
        symbol: "VEST",
        imageUrl: "https://uploadthing.com/f/abc",
        supply: "1000000000000",
        decimals: 9,
        feeAmount: "15",
        feeTransactionId: `tx-fee-${randomUUID()}`,
        mintAddress: `MintVest${randomUUID().slice(0, 8)}`,
        status: "COMPLETED",
        creatorId,
      },
    });
    tokenIds.push(token.id);
    return token;
  }

  afterAll(async () => {
    await prisma.vestingRelease.deleteMany({ where: { vestingContractId: { in: contractIds } } });
    await prisma.consumedPaymentTransaction.deleteMany({ where: { paymentId: { in: contractIds } } });
    await prisma.vestingContract.deleteMany({ where: { id: { in: contractIds } } });
    await prisma.launchedToken.deleteMany({ where: { id: { in: tokenIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  beforeEach(() => {
    getVerifiedToken.mockReset();
    verifySplTransferToPlatform.mockReset();
    executeVestingClaim.mockReset();
  });

  function validBody(launchedTokenId: string, beneficiaryWalletAddress: string, overrides: Record<string, unknown> = {}) {
    return {
      launchedTokenId,
      beneficiaryWalletAddress,
      amount: "1", // 1 whole token * 10^9 decimals = 1_000_000_000 raw
      cliffSeconds: 0,
      vestingSeconds: 0,
      depositTransactionId: `tx-${randomUUID()}`,
      ...overrides,
    };
  }

  it("rejects a deposit whose verified amount doesn't match the requested vesting amount (400)", async () => {
    const creator = await createUser("depositmismatch1");
    const token = await createToken(creator.id);
    asUser(creator.id);
    verifySplTransferToPlatform.mockResolvedValue(validDeposit({ rawAmount: BigInt("1") }));

    const res = await createVesting(req("https://zrp.one/api/launchpad/vesting", validBody(token.id, bs58.encode(nacl.sign.keyPair().publicKey))));
    expect(res.status).toBe(400);
  });

  it("rejects a deposit transaction already claimed by another payment (409)", async () => {
    const claimant = await createUser("vestclaimant1");
    const creator = await createUser("vestcreator1");
    const token = await createToken(creator.id);
    const txId = `tx-already-claimed-${randomUUID()}`;
    await prisma.consumedPaymentTransaction.create({ data: { transactionId: txId, paymentType: "tip", paymentId: claimant.id } });

    asUser(creator.id);
    const res = await createVesting(
      req("https://zrp.one/api/launchpad/vesting", validBody(token.id, bs58.encode(nacl.sign.keyPair().publicKey), { depositTransactionId: txId }))
    );
    expect(res.status).toBe(409);
    expect(verifySplTransferToPlatform).not.toHaveBeenCalled();
  });

  it("rejects a deposit sent from a wallet that isn't the creator's own verified wallet (400)", async () => {
    const creator = await createUser("vestcreator-bind1", "CreatorOwnWalletPlaceholder22222222");
    const token = await createToken(creator.id);
    asUser(creator.id);
    verifySplTransferToPlatform.mockResolvedValue(validDeposit({ from: "SomeoneElsesWalletPlaceholder33333" }));

    const res = await createVesting(req("https://zrp.one/api/launchpad/vesting", validBody(token.id, bs58.encode(nacl.sign.keyPair().publicKey))));
    expect(res.status).toBe(400);
  });

  it("happy path: verified deposit creates an ACTIVE contract", async () => {
    const creator = await createUser("vestcreator-happy1");
    const token = await createToken(creator.id);
    const beneficiary = bs58.encode(nacl.sign.keyPair().publicKey);
    asUser(creator.id);
    verifySplTransferToPlatform.mockResolvedValue(validDeposit());

    const res = await createVesting(req("https://zrp.one/api/launchpad/vesting", validBody(token.id, beneficiary)));
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.contract.status).toBe("ACTIVE");
    expect(data.contract.totalAmount).toBe("1000000000");
    contractIds.push(data.contract.id);
  });

  it("claim: a wallet that isn't the contract's beneficiary is refused (403)", async () => {
    const creator = await createUser("vestcreator-claim1");
    const token = await createToken(creator.id);
    const beneficiaryKeypair = nacl.sign.keyPair();
    const beneficiary = bs58.encode(beneficiaryKeypair.publicKey);
    asUser(creator.id);
    verifySplTransferToPlatform.mockResolvedValue(validDeposit());
    const createRes = await createVesting(req("https://zrp.one/api/launchpad/vesting", validBody(token.id, beneficiary)));
    const { contract } = await createRes.json();
    contractIds.push(contract.id);

    const impostor = bs58.encode(nacl.sign.keyPair().publicKey);
    const res = await claim(
      req(`https://zrp.one/api/launchpad/vesting/${contract.id}/claim`, { walletAddress: impostor, signature: "irrelevant" }),
      { params: Promise.resolve({ id: contract.id }) }
    );
    expect(res.status).toBe(403);
  });

  it("claim: an invalid signature is refused (400), even from the real beneficiary address", async () => {
    const creator = await createUser("vestcreator-claim2");
    const token = await createToken(creator.id);
    const beneficiaryKeypair = nacl.sign.keyPair();
    const beneficiary = bs58.encode(beneficiaryKeypair.publicKey);
    asUser(creator.id);
    verifySplTransferToPlatform.mockResolvedValue(validDeposit());
    const createRes = await createVesting(req("https://zrp.one/api/launchpad/vesting", validBody(token.id, beneficiary)));
    const { contract } = await createRes.json();
    contractIds.push(contract.id);

    await claimChallenge(req(`https://zrp.one/api/launchpad/vesting/${contract.id}/claim-challenge`, {}), {
      params: Promise.resolve({ id: contract.id }),
    });

    const res = await claim(
      req(`https://zrp.one/api/launchpad/vesting/${contract.id}/claim`, { walletAddress: beneficiary, signature: bs58.encode(new Uint8Array(64)) }),
      { params: Promise.resolve({ id: contract.id }) }
    );
    expect(res.status).toBe(400);
    expect(executeVestingClaim).not.toHaveBeenCalled();
  });

  it("claim: nothing claimable before the cliff, even with a genuine signature (400)", async () => {
    const creator = await createUser("vestcreator-claim3");
    const token = await createToken(creator.id);
    const beneficiaryKeypair = nacl.sign.keyPair();
    const beneficiary = bs58.encode(beneficiaryKeypair.publicKey);
    asUser(creator.id);
    verifySplTransferToPlatform.mockResolvedValue(validDeposit());
    const createRes = await createVesting(
      req("https://zrp.one/api/launchpad/vesting", validBody(token.id, beneficiary, { cliffSeconds: 999999, vestingSeconds: 0 }))
    );
    const { contract } = await createRes.json();
    contractIds.push(contract.id);

    const challengeRes = await claimChallenge(req(`https://zrp.one/api/launchpad/vesting/${contract.id}/claim-challenge`, {}), {
      params: Promise.resolve({ id: contract.id }),
    });
    const { message } = await challengeRes.json();
    const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), beneficiaryKeypair.secretKey));

    const res = await claim(req(`https://zrp.one/api/launchpad/vesting/${contract.id}/claim`, { walletAddress: beneficiary, signature }), {
      params: Promise.resolve({ id: contract.id }),
    });
    expect(res.status).toBe(400);
    expect(executeVestingClaim).not.toHaveBeenCalled();
  });

  it("claim: happy path with a genuine signature and something claimable succeeds", async () => {
    const creator = await createUser("vestcreator-claim4");
    const token = await createToken(creator.id);
    const beneficiaryKeypair = nacl.sign.keyPair();
    const beneficiary = bs58.encode(beneficiaryKeypair.publicKey);
    asUser(creator.id);
    verifySplTransferToPlatform.mockResolvedValue(validDeposit());
    // No cliff, no linear window - fully claimable immediately.
    const createRes = await createVesting(
      req("https://zrp.one/api/launchpad/vesting", validBody(token.id, beneficiary, { cliffSeconds: 0, vestingSeconds: 0 }))
    );
    const { contract } = await createRes.json();
    contractIds.push(contract.id);

    executeVestingClaim.mockResolvedValue({ success: true, signature: `claim-tx-${randomUUID()}` });

    const challengeRes = await claimChallenge(req(`https://zrp.one/api/launchpad/vesting/${contract.id}/claim-challenge`, {}), {
      params: Promise.resolve({ id: contract.id }),
    });
    const { message } = await challengeRes.json();
    const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), beneficiaryKeypair.secretKey));

    const res = await claim(req(`https://zrp.one/api/launchpad/vesting/${contract.id}/claim`, { walletAddress: beneficiary, signature }), {
      params: Promise.resolve({ id: contract.id }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.amount).toBe("1000000000");
    expect(executeVestingClaim).toHaveBeenCalledTimes(1);
  });

  it("claim: a nonce cannot be reused - the same signed message can't claim twice", async () => {
    const creator = await createUser("vestcreator-claim5");
    const token = await createToken(creator.id);
    const beneficiaryKeypair = nacl.sign.keyPair();
    const beneficiary = bs58.encode(beneficiaryKeypair.publicKey);
    asUser(creator.id);
    verifySplTransferToPlatform.mockResolvedValue(validDeposit());
    const createRes = await createVesting(
      req("https://zrp.one/api/launchpad/vesting", validBody(token.id, beneficiary, { cliffSeconds: 0, vestingSeconds: 0 }))
    );
    const { contract } = await createRes.json();
    contractIds.push(contract.id);
    executeVestingClaim.mockResolvedValue({ success: true, signature: `claim-tx-${randomUUID()}` });

    const challengeRes = await claimChallenge(req(`https://zrp.one/api/launchpad/vesting/${contract.id}/claim-challenge`, {}), {
      params: Promise.resolve({ id: contract.id }),
    });
    const { message } = await challengeRes.json();
    const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), beneficiaryKeypair.secretKey));

    const first = await claim(req(`https://zrp.one/api/launchpad/vesting/${contract.id}/claim`, { walletAddress: beneficiary, signature }), {
      params: Promise.resolve({ id: contract.id }),
    });
    expect(first.status).toBe(200);

    const second = await claim(req(`https://zrp.one/api/launchpad/vesting/${contract.id}/claim`, { walletAddress: beneficiary, signature }), {
      params: Promise.resolve({ id: contract.id }),
    });
    // The nonce was already cleared by the first claim, so the same
    // signed challenge message can't be replayed for a second payout.
    expect(second.status).toBe(400);
    expect(executeVestingClaim).toHaveBeenCalledTimes(1);
  });
});
