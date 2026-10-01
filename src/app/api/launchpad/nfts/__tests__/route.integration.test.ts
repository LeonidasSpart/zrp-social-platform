import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

/*
 * Integration coverage for POST /api/launchpad/nfts against a real
 * Postgres - same trust-boundary shape as the fungible token creation
 * route's own test file (fee verification, sender binding, replay
 * protection, verified-wallet gate, mint-failure surfacing).
 * verifyUsdcTransaction and mintLaunchedNft are both mocked; the rate
 * limiter, Prisma, and Postgres are real.
 */
const { getVerifiedToken, verifyUsdcTransaction, mintLaunchedNft } = vi.hoisted(() => ({
  getVerifiedToken: vi.fn(),
  verifyUsdcTransaction: vi.fn(),
  mintLaunchedNft: vi.fn(),
}));
vi.mock("@/lib/auth-guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-guards")>();
  return { ...actual, getVerifiedToken };
});
vi.mock("@/lib/solana", () => ({ verifyUsdcTransaction }));
vi.mock("@/lib/launchpad/mint-service", () => ({ mintLaunchedNft }));

import { prisma } from "@/lib/db";
import { POST as createNft } from "../route";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

let ipCounter = 1;
function req(body: unknown) {
  ipCounter += 1;
  return new NextRequest("https://zrp.one/api/launchpad/nfts", {
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

function freshWallet() {
  return `Wallet${randomUUID().replace(/-/g, "")}`.slice(0, 40);
}

function validVerification(from: string, overrides: Partial<{ amount: number }> = {}) {
  return { valid: true, amount: 5, from, ...overrides };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Test NFT",
    symbol: "TNFT",
    description: "a 1-of-1",
    imageUrl: "https://uploadthing.com/f/abc123",
    collectionName: "Test Collection",
    attributes: [{ trait_type: "Background", value: "Blue" }],
    sellerFeeBasisPoints: 500,
    revokeUpdate: false,
    transactionId: `tx-${randomUUID()}`,
    ...overrides,
  };
}

function mockMintSuccess() {
  mintLaunchedNft.mockImplementation(async (params: { launchedNftId: string }) => {
    await prisma.launchedNft.update({
      where: { id: params.launchedNftId },
      data: { status: "COMPLETED", mintAddress: `MintAddr${randomUUID().slice(0, 8)}`, mintTransactionId: `mint-tx-${randomUUID()}` },
    });
  });
}

function mockMintFailure(reason = "Transaction failed on-chain.") {
  mintLaunchedNft.mockImplementation(async (params: { launchedNftId: string }) => {
    await prisma.launchedNft.update({
      where: { id: params.launchedNftId },
      data: { status: "FAILED", failureReason: reason },
    });
  });
}

describe.skipIf(!hasRealDatabaseUrl)("POST /api/launchpad/nfts (integration, real Postgres)", () => {
  const userIds: string[] = [];
  const nftIds: string[] = [];

  async function createUser(label: string, verifiedSolanaWallet?: string) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${randomUUID().slice(0, 8)}@launchpadtest.example`,
        username: `${label}${randomUUID().slice(0, 8)}`.slice(0, 20),
        password: "x",
        verifiedSolanaWallet: verifiedSolanaWallet ?? null,
      },
    });
    userIds.push(user.id);
    return user;
  }

  afterAll(async () => {
    await prisma.consumedPaymentTransaction.deleteMany({ where: { paymentId: { in: nftIds } } });
    await prisma.launchedNft.deleteMany({ where: { id: { in: nftIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  beforeEach(() => {
    getVerifiedToken.mockReset();
    verifyUsdcTransaction.mockReset();
    mintLaunchedNft.mockReset();
  });

  it("rejects a user with no verified wallet (403), before touching payment verification", async () => {
    const user = await createUser("nftnowallet1");
    asUser(user.id);

    const res = await createNft(req(validBody()));
    expect(res.status).toBe(403);
    expect(verifyUsdcTransaction).not.toHaveBeenCalled();
  });

  it("rejects a fee amount that doesn't match the flat NFT creation fee", async () => {
    const wallet = freshWallet();
    const user = await createUser("nftbadfee1", wallet);
    asUser(user.id);
    verifyUsdcTransaction.mockResolvedValue(validVerification(wallet, { amount: 4.99 }));

    const res = await createNft(req(validBody()));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.requiredAmount).toBe(5);
  });

  it("rejects when the verified on-chain sender doesn't match the authenticated user's bound wallet", async () => {
    const user = await createUser("nftbadsender1", freshWallet());
    asUser(user.id);
    verifyUsdcTransaction.mockResolvedValue(validVerification(freshWallet()));

    const res = await createNft(req(validBody()));
    expect(res.status).toBe(400);
  });

  it("rejects a transaction signature that was already claimed (replay protection)", async () => {
    const wallet = freshWallet();
    const user = await createUser("nftreplay1", wallet);
    asUser(user.id);
    verifyUsdcTransaction.mockResolvedValue(validVerification(wallet));
    mockMintSuccess();

    const txId = `tx-${randomUUID()}`;
    const first = await createNft(req(validBody({ transactionId: txId })));
    expect(first.status).toBe(201);
    const firstData = await first.json();
    nftIds.push(firstData.nft.id);

    const second = await createNft(req(validBody({ transactionId: txId })));
    expect(second.status).toBe(409);
  });

  it("creates a COMPLETED LaunchedNft row with attributes on a successful mint", async () => {
    const wallet = freshWallet();
    const user = await createUser("nftsuccess1", wallet);
    asUser(user.id);
    verifyUsdcTransaction.mockResolvedValue(validVerification(wallet));
    mockMintSuccess();

    const res = await createNft(req(validBody()));
    expect(res.status).toBe(201);
    const data = await res.json();
    nftIds.push(data.nft.id);

    expect(data.success).toBe(true);
    expect(data.nft.status).toBe("COMPLETED");
    expect(data.nft.mintAddress).toBeTruthy();
    expect(data.nft.collectionName).toBe("Test Collection");
    expect(data.nft.attributes).toEqual([{ trait_type: "Background", value: "Blue" }]);
  });

  it("surfaces a mint failure as success:false rather than a thrown error", async () => {
    const wallet = freshWallet();
    const user = await createUser("nftfail1", wallet);
    asUser(user.id);
    verifyUsdcTransaction.mockResolvedValue(validVerification(wallet));
    mockMintFailure("Simulated on-chain failure.");

    const res = await createNft(req(validBody()));
    expect(res.status).toBe(201);
    const data = await res.json();
    nftIds.push(data.nft.id);

    expect(data.success).toBe(false);
    expect(data.nft.status).toBe("FAILED");
    expect(data.nft.failureReason).toBe("Simulated on-chain failure.");
  });

  it("rejects more than 20 attributes", async () => {
    const user = await createUser("nftmanyattrs1", freshWallet());
    asUser(user.id);

    const tooMany = Array.from({ length: 21 }, (_, i) => ({ trait_type: `T${i}`, value: `V${i}` }));
    const res = await createNft(req(validBody({ attributes: tooMany })));
    expect(res.status).toBe(400);
  });
});
