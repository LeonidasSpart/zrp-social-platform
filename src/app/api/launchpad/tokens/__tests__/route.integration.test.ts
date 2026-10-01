import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { Keypair } from "@solana/web3.js";

/*
 * Integration coverage for POST /api/launchpad/tokens against a real
 * Postgres. The mint now happens entirely in the browser (see
 * client-token-mint.ts) before this route is ever called, so the trust
 * boundary this route guards is different from the old server-signed
 * path: it must never trust client-submitted decimals/supply/
 * authorities/name/symbol, and must prove the SAME transaction that
 * paid the fee also created the claimed mint (mint-verification.ts).
 * verifyUsdcTransaction, scanTokenOnChain and verifyTransactionCreatedMint
 * are all mocked (no real RPC call); the rate limiter, Prisma and
 * Postgres are real.
 */
const { getVerifiedToken, verifyUsdcTransaction, scanTokenOnChain, verifyTransactionCreatedMint } = vi.hoisted(() => ({
  getVerifiedToken: vi.fn(),
  verifyUsdcTransaction: vi.fn(),
  scanTokenOnChain: vi.fn(),
  verifyTransactionCreatedMint: vi.fn(),
}));
vi.mock("@/lib/auth-guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-guards")>();
  return { ...actual, getVerifiedToken };
});
vi.mock("@/lib/solana", () => ({ verifyUsdcTransaction }));
vi.mock("@/lib/launchpad/mint-verification", () => ({ scanTokenOnChain, verifyTransactionCreatedMint }));

import { prisma } from "@/lib/db";
import { POST as createToken } from "../route";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

let ipCounter = 1;
function req(body: unknown) {
  ipCounter += 1;
  return new NextRequest("https://zrp.one/api/launchpad/tokens", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `10.${(ipCounter >> 8) & 255}.${ipCounter & 255}.9`,
    },
    body: JSON.stringify(body),
  });
}

function asUser(userId: string) {
  getVerifiedToken.mockResolvedValue({ id: userId });
}

function validVerification(overrides: Partial<{ amount: number; from: string }> = {}) {
  return { valid: true, amount: 15, from: "SenderWalletBase58Placeholder111111", ...overrides };
}

function validOnChainScan(overrides: Record<string, unknown> = {}) {
  return {
    mintAddress: "placeholder",
    supplyRaw: "1000000000000000",
    decimals: 9,
    mintAuthority: null,
    freezeAuthority: null,
    metadata: { name: "Test Token", symbol: "TEST", uri: "https://example.com/metadata.json", updateAuthority: "x", isMutable: true },
    topHolders: [],
    topHolderConcentrationPercent: 0,
    riskFlags: [],
    ...overrides,
  };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Test Token",
    symbol: "TEST",
    description: "a token",
    imageUrl: "https://uploadthing.com/f/abc123",
    mintAddress: Keypair.generate().publicKey.toBase58(),
    transactionId: `tx-${randomUUID()}`,
    ...overrides,
  };
}

describe.skipIf(!hasRealDatabaseUrl)("POST /api/launchpad/tokens (integration, real Postgres)", () => {
  const userIds: string[] = [];
  const tokenIds: string[] = [];

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${randomUUID().slice(0, 8)}@launchpadtest.example`,
        username: `${label}${randomUUID().slice(0, 8)}`.slice(0, 20),
        password: "x",
      },
    });
    userIds.push(user.id);
    return user;
  }

  afterAll(async () => {
    await prisma.consumedPaymentTransaction.deleteMany({ where: { paymentId: { in: tokenIds } } });
    await prisma.launchedToken.deleteMany({ where: { id: { in: tokenIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  beforeEach(() => {
    getVerifiedToken.mockReset();
    verifyUsdcTransaction.mockReset();
    scanTokenOnChain.mockReset();
    verifyTransactionCreatedMint.mockReset();
    verifyTransactionCreatedMint.mockResolvedValue(true);
  });

  it("rejects an invalid/unverifiable fee transaction (400), before reading the chain", async () => {
    const user = await createUser("badtx1");
    asUser(user.id);
    verifyUsdcTransaction.mockRejectedValue(new Error("Transaction not found."));

    const res = await createToken(req(validBody()));
    expect(res.status).toBe(400);
    expect(scanTokenOnChain).not.toHaveBeenCalled();
  });

  it("rejects a fee amount that doesn't match the required creation fee (400)", async () => {
    const user = await createUser("underpay1");
    asUser(user.id);
    verifyUsdcTransaction.mockResolvedValue(validVerification({ amount: 1 }));

    const res = await createToken(req(validBody()));
    expect(res.status).toBe(400);
  });

  it("rejects a transaction ID already claimed by another payment (409), without reading the chain", async () => {
    const claimant = await createUser("claimant1");
    const attacker = await createUser("attacker1");
    const txId = `tx-already-claimed-${randomUUID()}`;
    await prisma.consumedPaymentTransaction.create({
      data: { transactionId: txId, paymentType: "tip", paymentId: claimant.id },
    });

    asUser(attacker.id);
    verifyUsdcTransaction.mockResolvedValue(validVerification());

    const res = await createToken(req(validBody({ transactionId: txId })));
    expect(res.status).toBe(409);
    expect(scanTokenOnChain).not.toHaveBeenCalled();
  });

  it("rejects a mint address that's already been recorded (409)", async () => {
    const original = await createUser("original1");
    const mintAddress = Keypair.generate().publicKey.toBase58();
    const row = await prisma.launchedToken.create({
      data: {
        mintAddress,
        name: "Existing",
        symbol: "EXIST",
        imageUrl: "https://uploadthing.com/f/existing",
        supply: "1",
        decimals: 0,
        revokeMint: true,
        revokeFreeze: true,
        revokeUpdate: false,
        feeAmount: 15,
        feeTransactionId: `tx-existing-${randomUUID()}`,
        mintTransactionId: `tx-existing-${randomUUID()}`,
        status: "COMPLETED",
        creatorId: original.id,
      },
    });
    tokenIds.push(row.id);

    const attacker = await createUser("claimer1");
    asUser(attacker.id);
    verifyUsdcTransaction.mockResolvedValue(validVerification());

    const res = await createToken(req(validBody({ mintAddress })));
    expect(res.status).toBe(409);
  });

  it("rejects when the fee transaction did not create the claimed mint (400) - closes the replay-a-real-payment-against-an-unrelated-mint gap", async () => {
    const user = await createUser("replay1");
    asUser(user.id);
    verifyUsdcTransaction.mockResolvedValue(validVerification({ from: "ReplayWallet11111111111111111111111" }));
    verifyTransactionCreatedMint.mockResolvedValue(false);

    const res = await createToken(req(validBody()));
    expect(res.status).toBe(400);
    expect(scanTokenOnChain).not.toHaveBeenCalled();
  });

  it("returns 502 when the mint can't be read from the chain", async () => {
    const user = await createUser("rpcfail1");
    asUser(user.id);
    verifyUsdcTransaction.mockResolvedValue(validVerification({ from: "RpcFailWallet111111111111111111111" }));
    scanTokenOnChain.mockRejectedValue(new Error("RPC unavailable"));

    const res = await createToken(req(validBody()));
    expect(res.status).toBe(502);
  });

  it("happy path: records the token using on-chain-derived fields, never the client's claimed ones (201)", async () => {
    const user = await createUser("happy1");
    asUser(user.id);
    const mintAddress = Keypair.generate().publicKey.toBase58();
    verifyUsdcTransaction.mockResolvedValue(validVerification({ amount: 15, from: "WalletPlaceholder4444444444444444444" }));
    scanTokenOnChain.mockResolvedValue(
      validOnChainScan({
        mintAddress,
        supplyRaw: "1000000000000000",
        decimals: 9,
        mintAuthority: null,
        freezeAuthority: "StillHeldAuthority1111111111111111",
        metadata: { name: "Real On-Chain Name", symbol: "REAL", uri: "https://x", updateAuthority: "x", isMutable: true },
      })
    );

    // Client claims entirely different, untrustworthy values - the
    // route must ignore all of them in favour of the on-chain read.
    const res = await createToken(
      req(
        validBody({
          mintAddress,
          name: "Totally Different Claimed Name",
          symbol: "FAKE",
        })
      )
    );
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    tokenIds.push(data.token.id);

    const row = await prisma.launchedToken.findUnique({ where: { id: data.token.id } });
    expect(row?.name).toBe("Real On-Chain Name");
    expect(row?.symbol).toBe("REAL");
    expect(row?.decimals).toBe(9);
    expect(row?.supply.toString()).toBe("1000000000000000");
    expect(row?.revokeMint).toBe(true); // mintAuthority was null on-chain
    expect(row?.revokeFreeze).toBe(false); // freezeAuthority was still held
    expect(row?.revokeUpdate).toBe(false); // metadata.isMutable was true
    expect(row?.status).toBe("COMPLETED");
    expect(row?.creatorId).toBe(user.id);
  });

  it("rate limit: a 6th request in the window from the same user is rejected (429)", async () => {
    const user = await createUser("ratelimited1");
    asUser(user.id);
    verifyUsdcTransaction.mockResolvedValue(validVerification());
    scanTokenOnChain.mockResolvedValue(validOnChainScan());

    const fixedReq = (mintAddress: string) =>
      new NextRequest("https://zrp.one/api/launchpad/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.99.99.99" },
        body: JSON.stringify(validBody({ mintAddress })),
      });

    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const mintAddress = Keypair.generate().publicKey.toBase58();
      scanTokenOnChain.mockResolvedValue(validOnChainScan({ mintAddress }));
      const res = await createToken(fixedReq(mintAddress));
      statuses.push(res.status);
      if (res.status === 201) {
        const data = await res.json();
        if (data?.token?.id) tokenIds.push(data.token.id);
      }
    }

    expect(statuses[5]).toBe(429);
  });

  // ─── Affiliate/referral commission crediting (src/lib/referral.ts) ───
  describe("referral commission on a successful mint", () => {
    async function createAmbassador(label: string, status: "PENDING" | "APPROVED" | "SUSPENDED") {
      const owner = await createUser(`${label}owner`);
      const ambassador = await prisma.ambassadorProfile.create({
        data: {
          userId: owner.id,
          status,
          invitationCode: `REF-${label}-${randomUUID().slice(0, 8)}`,
          countryCode: "CH",
          motivation: "integration test fixture",
        },
      });
      return { owner, ambassador };
    }

    it("credits the referring APPROVED ambassador 15% of the fee into their CreatorProfile balance", async () => {
      const { owner, ambassador } = await createAmbassador("approved", "APPROVED");
      const referred = await createUser("refd1");
      await prisma.referral.create({ data: { ambassadorProfileId: ambassador.id, referredUserId: referred.id } });

      asUser(referred.id);
      verifyUsdcTransaction.mockResolvedValue(validVerification({ amount: 15, from: "WalletPlaceholder7777777777777777777" }));
      scanTokenOnChain.mockResolvedValue(validOnChainScan());

      const res = await createToken(req(validBody()));
      const data = await res.json();
      expect(res.status).toBe(201);
      tokenIds.push(data.token.id);

      const commission = await prisma.referralCommission.findUnique({
        where: { sourceType_sourceId: { sourceType: "LAUNCHPAD_TOKEN_CREATION", sourceId: data.token.id } },
      });
      expect(commission?.feeAmount.toString()).toBe("15");
      expect(commission?.commissionAmount.toString()).toBe("2.25");

      const creatorProfile = await prisma.creatorProfile.findUnique({ where: { userId: owner.id } });
      expect(creatorProfile?.balance.toString()).toBe("2.25");
      expect(creatorProfile?.totalEarnings.toString()).toBe("2.25");
    });

    it("does not credit commission when the referring ambassador is not APPROVED", async () => {
      const { owner, ambassador } = await createAmbassador("pending", "PENDING");
      const referred = await createUser("refd2");
      await prisma.referral.create({ data: { ambassadorProfileId: ambassador.id, referredUserId: referred.id } });

      asUser(referred.id);
      verifyUsdcTransaction.mockResolvedValue(validVerification({ amount: 15, from: "WalletPlaceholder8888888888888888888" }));
      scanTokenOnChain.mockResolvedValue(validOnChainScan());

      const res = await createToken(req(validBody()));
      const data = await res.json();
      expect(res.status).toBe(201);
      tokenIds.push(data.token.id);

      expect(
        await prisma.referralCommission.findUnique({
          where: { sourceType_sourceId: { sourceType: "LAUNCHPAD_TOKEN_CREATION", sourceId: data.token.id } },
        })
      ).toBeNull();
      expect(await prisma.creatorProfile.findUnique({ where: { userId: owner.id } })).toBeNull();
    });

    it("does not credit commission for a fee-payer who was never referred", async () => {
      const user = await createUser("notreferred1");
      asUser(user.id);
      verifyUsdcTransaction.mockResolvedValue(validVerification({ amount: 15, from: "WalletPlaceholder9999999999999999999" }));
      scanTokenOnChain.mockResolvedValue(validOnChainScan());

      const res = await createToken(req(validBody()));
      const data = await res.json();
      expect(res.status).toBe(201);
      tokenIds.push(data.token.id);

      expect(
        await prisma.referralCommission.findUnique({
          where: { sourceType_sourceId: { sourceType: "LAUNCHPAD_TOKEN_CREATION", sourceId: data.token.id } },
        })
      ).toBeNull();
    });
  });
});
