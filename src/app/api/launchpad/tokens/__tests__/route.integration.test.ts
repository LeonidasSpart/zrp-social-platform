import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

/*
 * Integration coverage for POST /api/launchpad/tokens against a real
 * Postgres - the trust-boundary behaviors that matter here are the same
 * shape as creator/tip's own coverage (fee verification, sender binding,
 * replay protection via ConsumedPaymentTransaction) plus the two things
 * specific to this route: the verified-wallet gate, and that a mint
 * failure is surfaced as `success: false` rather than silently reported
 * as a created token. verifyUsdcTransaction and mintLaunchedToken are
 * both mocked (no real RPC call / no real Solana transaction); the
 * rate limiter, Prisma, and Postgres are real.
 */
const { getVerifiedToken, verifyUsdcTransaction, mintLaunchedToken } = vi.hoisted(() => ({
  getVerifiedToken: vi.fn(),
  verifyUsdcTransaction: vi.fn(),
  mintLaunchedToken: vi.fn(),
}));
vi.mock("@/lib/auth-guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-guards")>();
  return { ...actual, getVerifiedToken };
});
vi.mock("@/lib/solana", () => ({ verifyUsdcTransaction }));
vi.mock("@/lib/launchpad/mint-service", () => ({ mintLaunchedToken }));

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

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Test Token",
    symbol: "TEST",
    description: "a token",
    imageUrl: "https://uploadthing.com/f/abc123",
    supply: "1000000",
    decimals: 9,
    revokeMint: true,
    revokeFreeze: true,
    revokeUpdate: false,
    transactionId: `tx-${randomUUID()}`,
    ...overrides,
  };
}

// mintLaunchedToken mocks that mirror the real function's crash-safety
// contract: it writes the LaunchedToken row itself and returns void.
function mockMintSuccess() {
  mintLaunchedToken.mockImplementation(async (params: { launchedTokenId: string }) => {
    await prisma.launchedToken.update({
      where: { id: params.launchedTokenId },
      data: { status: "COMPLETED", mintAddress: `MintAddr${randomUUID().slice(0, 8)}`, mintTransactionId: `mint-tx-${randomUUID()}` },
    });
  });
}

function mockMintFailure(reason = "Transaction failed on-chain.") {
  mintLaunchedToken.mockImplementation(async (params: { launchedTokenId: string }) => {
    await prisma.launchedToken.update({
      where: { id: params.launchedTokenId },
      data: { status: "FAILED", failureReason: reason },
    });
  });
}

describe.skipIf(!hasRealDatabaseUrl)("POST /api/launchpad/tokens (integration, real Postgres)", () => {
  const userIds: string[] = [];
  const tokenIds: string[] = [];

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
    await prisma.consumedPaymentTransaction.deleteMany({ where: { paymentId: { in: tokenIds } } });
    await prisma.launchedToken.deleteMany({ where: { id: { in: tokenIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  beforeEach(() => {
    getVerifiedToken.mockReset();
    verifyUsdcTransaction.mockReset();
    mintLaunchedToken.mockReset();
  });

  it("rejects a user with no verified wallet (403), before touching payment verification", async () => {
    const user = await createUser("nowallet1");
    asUser(user.id);

    const res = await createToken(req(validBody()));
    expect(res.status).toBe(403);
    expect(verifyUsdcTransaction).not.toHaveBeenCalled();
  });

  it("rejects an invalid/unverifiable fee transaction (400)", async () => {
    const user = await createUser("badtx1", "WalletPlaceholder1111111111111111111");
    asUser(user.id);
    verifyUsdcTransaction.mockRejectedValue(new Error("Transaction not found."));

    const res = await createToken(req(validBody()));
    expect(res.status).toBe(400);
    expect(mintLaunchedToken).not.toHaveBeenCalled();
  });

  it("rejects a fee amount that doesn't match the required creation fee (400)", async () => {
    const user = await createUser("underpay1", "WalletPlaceholder2222222222222222222");
    asUser(user.id);
    verifyUsdcTransaction.mockResolvedValue(validVerification({ amount: 1 }));

    const res = await createToken(req(validBody()));
    expect(res.status).toBe(400);
  });

  it("rejects a transaction ID already claimed by another payment (409), without minting", async () => {
    const claimant = await createUser("claimant1");
    const attacker = await createUser("attacker1", "WalletPlaceholder3333333333333333333");
    const txId = `tx-already-claimed-${randomUUID()}`;
    await prisma.consumedPaymentTransaction.create({
      data: { transactionId: txId, paymentType: "tip", paymentId: claimant.id },
    });

    asUser(attacker.id);
    verifyUsdcTransaction.mockResolvedValue(validVerification());

    const res = await createToken(req(validBody({ transactionId: txId })));
    expect(res.status).toBe(409);
    expect(mintLaunchedToken).not.toHaveBeenCalled();
    expect(await prisma.launchedToken.count({ where: { feeTransactionId: txId } })).toBe(0);
  });

  it("happy path: verified wallet + valid fee creates the row and mints successfully (201)", async () => {
    const user = await createUser("happy1", "WalletPlaceholder4444444444444444444");
    asUser(user.id);
    verifyUsdcTransaction.mockResolvedValue(validVerification({ amount: 15, from: "WalletPlaceholder4444444444444444444" }));
    mockMintSuccess();

    const res = await createToken(req(validBody()));
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.token.mintAddress).toBeTruthy();
    expect(data.token.status).toBe("COMPLETED");
    tokenIds.push(data.token.id);

    const row = await prisma.launchedToken.findUnique({ where: { id: data.token.id } });
    expect(row?.creatorId).toBe(user.id);
    // supply="1000000", decimals=9 -> raw base units = 1_000_000 * 10^9
    expect(row?.supply.toString()).toBe("1000000000000000");

    expect(mintLaunchedToken).toHaveBeenCalledTimes(1);
    const mintCall = mintLaunchedToken.mock.calls[0][0];
    expect(mintCall.ownerWalletAddress).toBe("WalletPlaceholder4444444444444444444");
    expect(mintCall.supply).toBe(BigInt(1000000000000000));
  });

  it("a mint that fails on-chain is reported as success:false, not silently as a created token", async () => {
    const user = await createUser("mintfail1", "WalletPlaceholder5555555555555555555");
    asUser(user.id);
    verifyUsdcTransaction.mockResolvedValue(validVerification({ amount: 15, from: "WalletPlaceholder5555555555555555555" }));
    mockMintFailure("Simulated on-chain failure.");

    const res = await createToken(req(validBody()));
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.success).toBe(false);
    expect(data.token.status).toBe("FAILED");
    tokenIds.push(data.token.id);

    // The fee was still consumed - this is the accepted, documented
    // tradeoff for a v1 synchronous mint with no reconciliation job
    // (see mint-service.ts's own comment on that).
    expect(await prisma.consumedPaymentTransaction.count({ where: { paymentId: data.token.id } })).toBe(1);
  });

  it("rate limit: a 6th request in the window from the same user is rejected (429)", async () => {
    const user = await createUser("ratelimited1", "WalletPlaceholder6666666666666666666");
    asUser(user.id);
    verifyUsdcTransaction.mockResolvedValue(validVerification());

    // All 6 requests reuse the SAME ip/user deliberately (the per-route
    // helper `req()` normally varies IP per call to avoid tripping the
    // limiter - here that's the point, so build requests directly).
    const fixedReq = () =>
      new NextRequest("https://zrp.one/api/launchpad/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.99.99.99" },
        body: JSON.stringify(validBody()),
      });

    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const res = await createToken(fixedReq());
      statuses.push(res.status);
      if (res.status === 201) {
        const data = await res.json();
        if (data?.token?.id) tokenIds.push(data.token.id);
      }
    }

    expect(statuses[5]).toBe(429);
  });
});
