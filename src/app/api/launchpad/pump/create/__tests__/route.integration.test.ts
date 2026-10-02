import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { Keypair } from "@solana/web3.js";

/*
 * Integration coverage for POST /api/launchpad/pump/create against a real
 * Postgres. The pump mint+initial-buy itself happens entirely in the
 * browser (client-pump-create.ts) against pump.fun's own program before
 * this route is ever called, so the trust boundary this route guards is:
 * never trust the client's claimed name/symbol/decimals/supply, and never
 * record a token before the SAME transaction it claims is independently
 * decoded as a real CreateEvent naming the claimed wallet as creator.
 * verifyCreateTransaction and scanTokenOnChain are mocked (no real RPC
 * call); the rate limiter, Prisma and Postgres are real.
 */
const { getVerifiedToken, verifyCreateTransaction, scanTokenOnChain } = vi.hoisted(() => ({
  getVerifiedToken: vi.fn(),
  verifyCreateTransaction: vi.fn(),
  scanTokenOnChain: vi.fn(),
}));
vi.mock("@/lib/auth-guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-guards")>();
  return { ...actual, getVerifiedToken };
});
vi.mock("@/lib/launchpad/pump-curve-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/launchpad/pump-curve-service")>();
  return { ...actual, verifyCreateTransaction };
});
vi.mock("@/lib/launchpad/mint-verification", () => ({ scanTokenOnChain }));

import { prisma } from "@/lib/db";
import { POST as createPumpToken } from "../route";
import { CurveVerificationError } from "@/lib/launchpad/pump-curve-service";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

let ipCounter = 1;
function req(body: unknown) {
  ipCounter += 1;
  return new NextRequest("https://zrp.one/api/launchpad/pump/create", {
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

function validVerifiedCreate(overrides: Record<string, unknown> = {}) {
  return {
    name: "Real On-Chain Name",
    symbol: "REAL",
    bondingCurveAddress: Keypair.generate().publicKey.toBase58(),
    blockTime: new Date(),
    slot: 12345,
    ...overrides,
  };
}

function validOnChainScan(overrides: Record<string, unknown> = {}) {
  return {
    mintAddress: "placeholder",
    supplyRaw: "1000000000000000",
    decimals: 6,
    mintAuthority: null,
    freezeAuthority: null,
    metadata: { name: "Real On-Chain Name", symbol: "REAL", uri: "https://x", updateAuthority: "x", isMutable: false },
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
    description: "a pump token",
    imageUrl: "https://uploadthing.com/f/abc123",
    mintAddress: Keypair.generate().publicKey.toBase58(),
    walletAddress: Keypair.generate().publicKey.toBase58(),
    transactionId: `tx-${randomUUID()}`,
    ...overrides,
  };
}

describe.skipIf(!hasRealDatabaseUrl)("POST /api/launchpad/pump/create (integration, real Postgres)", () => {
  const userIds: string[] = [];
  const tokenIds: string[] = [];

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${randomUUID().slice(0, 8)}@pumpcreatetest.example`,
        username: `${label}${randomUUID().slice(0, 8)}`.slice(0, 20),
        password: "x",
      },
    });
    userIds.push(user.id);
    return user;
  }

  afterAll(async () => {
    await prisma.launchedToken.deleteMany({ where: { id: { in: tokenIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  beforeEach(() => {
    getVerifiedToken.mockReset();
    verifyCreateTransaction.mockReset();
    scanTokenOnChain.mockReset();
  });

  it("rejects an unauthenticated request (401) before touching the chain", async () => {
    getVerifiedToken.mockResolvedValue(null);
    const res = await createPumpToken(req(validBody()));
    expect(res.status).toBe(401);
    expect(verifyCreateTransaction).not.toHaveBeenCalled();
  });

  it("rejects a missing/invalid name (400)", async () => {
    const user = await createUser("badname1");
    asUser(user.id);
    const res = await createPumpToken(req(validBody({ name: "" })));
    expect(res.status).toBe(400);
    expect(verifyCreateTransaction).not.toHaveBeenCalled();
  });

  it("rejects an invalid symbol (400)", async () => {
    const user = await createUser("badsymbol1");
    asUser(user.id);
    const res = await createPumpToken(req(validBody({ symbol: "not valid!" })));
    expect(res.status).toBe(400);
    expect(verifyCreateTransaction).not.toHaveBeenCalled();
  });

  it("rejects an untrusted image URL (400)", async () => {
    const user = await createUser("badimage1");
    asUser(user.id);
    const res = await createPumpToken(req(validBody({ imageUrl: "https://evil.example.com/x.png" })));
    expect(res.status).toBe(400);
    expect(verifyCreateTransaction).not.toHaveBeenCalled();
  });

  it("rejects an invalid mint address (400)", async () => {
    const user = await createUser("badmint1");
    asUser(user.id);
    const res = await createPumpToken(req(validBody({ mintAddress: "not-a-pubkey" })));
    expect(res.status).toBe(400);
    expect(verifyCreateTransaction).not.toHaveBeenCalled();
  });

  it("rejects an invalid wallet address (400)", async () => {
    const user = await createUser("badwallet1");
    asUser(user.id);
    const res = await createPumpToken(req(validBody({ walletAddress: "not-a-pubkey" })));
    expect(res.status).toBe(400);
    expect(verifyCreateTransaction).not.toHaveBeenCalled();
  });

  it("rejects a missing transaction ID (400)", async () => {
    const user = await createUser("badtx1");
    asUser(user.id);
    const res = await createPumpToken(req(validBody({ transactionId: "" })));
    expect(res.status).toBe(400);
    expect(verifyCreateTransaction).not.toHaveBeenCalled();
  });

  it("rejects a mint address that's already been recorded (409), without calling the chain", async () => {
    const original = await createUser("original1");
    const mintAddress = Keypair.generate().publicKey.toBase58();
    const row = await prisma.launchedToken.create({
      data: {
        venue: "PUMP_CURVE",
        mintAddress,
        name: "Existing",
        symbol: "EXIST",
        imageUrl: "https://uploadthing.com/f/existing",
        supply: "1",
        decimals: 6,
        revokeMint: true,
        revokeFreeze: true,
        revokeUpdate: true,
        feeAmount: null,
        feeTransactionId: null,
        mintTransactionId: `tx-existing-${randomUUID()}`,
        status: "COMPLETED",
        creatorId: original.id,
      },
    });
    tokenIds.push(row.id);

    const attacker = await createUser("claimer1");
    asUser(attacker.id);

    const res = await createPumpToken(req(validBody({ mintAddress })));
    expect(res.status).toBe(409);
    expect(verifyCreateTransaction).not.toHaveBeenCalled();
  });

  it("rejects a transaction ID that's already been recorded (409), without calling the chain", async () => {
    const original = await createUser("original2");
    const transactionId = `tx-already-recorded-${randomUUID()}`;
    const row = await prisma.launchedToken.create({
      data: {
        venue: "PUMP_CURVE",
        mintAddress: Keypair.generate().publicKey.toBase58(),
        name: "Existing2",
        symbol: "EXIST2",
        imageUrl: "https://uploadthing.com/f/existing2",
        supply: "1",
        decimals: 6,
        revokeMint: true,
        revokeFreeze: true,
        revokeUpdate: true,
        feeAmount: null,
        feeTransactionId: null,
        mintTransactionId: transactionId,
        status: "COMPLETED",
        creatorId: original.id,
      },
    });
    tokenIds.push(row.id);

    const attacker = await createUser("claimer2");
    asUser(attacker.id);

    const res = await createPumpToken(req(validBody({ transactionId })));
    expect(res.status).toBe(409);
    expect(verifyCreateTransaction).not.toHaveBeenCalled();
  });

  it("maps a NOT_FOUND_YET verification failure to a retryable 202", async () => {
    const user = await createUser("notfoundyet1");
    asUser(user.id);
    verifyCreateTransaction.mockRejectedValue(
      new CurveVerificationError("NOT_FOUND_YET", "Transaction not found yet. It may still be propagating.")
    );

    const res = await createPumpToken(req(validBody()));
    expect(res.status).toBe(202);
    expect(scanTokenOnChain).not.toHaveBeenCalled();
  });

  it("maps an ON_CHAIN_FAILURE verification failure (e.g. wallet is not the real creator) to 400", async () => {
    const user = await createUser("onchainfail1");
    asUser(user.id);
    verifyCreateTransaction.mockRejectedValue(
      new CurveVerificationError("ON_CHAIN_FAILURE", "The claimed wallet is not this token's on-chain creator.")
    );

    const res = await createPumpToken(req(validBody()));
    expect(res.status).toBe(400);
    expect(scanTokenOnChain).not.toHaveBeenCalled();
  });

  it("returns 502 when verification throws an unexpected (non-CurveVerificationError) error", async () => {
    const user = await createUser("rpcfail1");
    asUser(user.id);
    verifyCreateTransaction.mockRejectedValue(new Error("RPC unavailable"));

    const res = await createPumpToken(req(validBody()));
    expect(res.status).toBe(502);
  });

  it("returns 502 when the mint can't be re-scanned from the chain after a verified create", async () => {
    const user = await createUser("scanfail1");
    asUser(user.id);
    verifyCreateTransaction.mockResolvedValue(validVerifiedCreate());
    scanTokenOnChain.mockRejectedValue(new Error("RPC unavailable"));

    const res = await createPumpToken(req(validBody()));
    expect(res.status).toBe(502);
  });

  it("happy path: records the token using the verified on-chain name/symbol, never the client's claimed ones (201)", async () => {
    const user = await createUser("happy1");
    asUser(user.id);
    const mintAddress = Keypair.generate().publicKey.toBase58();
    verifyCreateTransaction.mockResolvedValue(
      validVerifiedCreate({ name: "Genuine Pump Name", symbol: "GENU" })
    );
    scanTokenOnChain.mockResolvedValue(
      validOnChainScan({ mintAddress, supplyRaw: "1000000000000000", decimals: 6 })
    );

    // Client claims entirely different, untrustworthy values - the route
    // must ignore them in favour of the independently-verified on-chain
    // CreateEvent's own name/symbol.
    const res = await createPumpToken(
      req(validBody({ mintAddress, name: "Totally Different Claimed Name", symbol: "FAKE" }))
    );
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    tokenIds.push(data.token.id);

    const row = await prisma.launchedToken.findUnique({ where: { id: data.token.id } });
    expect(row?.venue).toBe("PUMP_CURVE");
    expect(row?.name).toBe("Genuine Pump Name");
    expect(row?.symbol).toBe("GENU");
    expect(row?.decimals).toBe(6);
    expect(row?.supply.toString()).toBe("1000000000000000");
    expect(row?.revokeMint).toBe(true);
    expect(row?.revokeFreeze).toBe(true);
    expect(row?.revokeUpdate).toBe(true);
    expect(row?.feeAmount).toBeNull();
    expect(row?.feeTransactionId).toBeNull();
    expect(row?.status).toBe("COMPLETED");
    expect(row?.creatorId).toBe(user.id);
  });

  it("falls back to the client's cosmetic name/symbol only when the verified event's own fields are empty", async () => {
    const user = await createUser("fallback1");
    asUser(user.id);
    const mintAddress = Keypair.generate().publicKey.toBase58();
    verifyCreateTransaction.mockResolvedValue(validVerifiedCreate({ name: "", symbol: "" }));
    scanTokenOnChain.mockResolvedValue(validOnChainScan({ mintAddress }));

    const res = await createPumpToken(
      req(validBody({ mintAddress, name: "Cosmetic Fallback Name", symbol: "cosm" }))
    );
    const data = await res.json();
    expect(res.status).toBe(201);
    tokenIds.push(data.token.id);

    const row = await prisma.launchedToken.findUnique({ where: { id: data.token.id } });
    expect(row?.name).toBe("Cosmetic Fallback Name");
    expect(row?.symbol).toBe("COSM");
  });

  it("rate limit: a 6th request in the window from the same user is rejected (429)", async () => {
    const user = await createUser("ratelimited1");
    asUser(user.id);
    verifyCreateTransaction.mockResolvedValue(validVerifiedCreate());
    scanTokenOnChain.mockResolvedValue(validOnChainScan());

    const fixedReq = (mintAddress: string, transactionId: string) =>
      new NextRequest("https://zrp.one/api/launchpad/pump/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.88.88.88" },
        body: JSON.stringify(validBody({ mintAddress, transactionId })),
      });

    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const mintAddress = Keypair.generate().publicKey.toBase58();
      const transactionId = `tx-ratelimit-${randomUUID()}`;
      scanTokenOnChain.mockResolvedValue(validOnChainScan({ mintAddress }));
      const res = await createPumpToken(fixedReq(mintAddress, transactionId));
      statuses.push(res.status);
      if (res.status === 201) {
        const data = await res.json();
        if (data?.token?.id) tokenIds.push(data.token.id);
      }
    }

    expect(statuses[5]).toBe(429);
  });
});
