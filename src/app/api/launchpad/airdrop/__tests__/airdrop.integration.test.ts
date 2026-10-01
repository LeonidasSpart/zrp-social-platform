import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { Keypair } from "@solana/web3.js";

/*
 * Integration coverage for the airdrop recording trust boundary against
 * a real Postgres. verifyAirdropBatchTransaction is mocked (no real RPC
 * call) so these tests focus on: creator-only authorization, a claimed
 * "success" batch being downgraded to FAILED when on-chain verification
 * doesn't back it up, and FAILED/DISPUTED batches being recorded as
 * reported (nothing to verify for those - no payout claim is being made).
 */
const { getVerifiedToken, verifyAirdropBatchTransaction } = vi.hoisted(() => ({
  getVerifiedToken: vi.fn(),
  verifyAirdropBatchTransaction: vi.fn(),
}));
vi.mock("@/lib/auth-guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-guards")>();
  return { ...actual, getVerifiedToken };
});
vi.mock("@/lib/launchpad/airdrop-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/launchpad/airdrop-service")>();
  return { ...actual, verifyAirdropBatchTransaction };
});
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, rateLimitByIpAndUser: vi.fn().mockResolvedValue({ success: true }) };
});

import { prisma } from "@/lib/db";
import { GET as getAirdrops, POST as recordAirdrop } from "../route";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

let ipCounter = 1;
function req(url: string, body: unknown) {
  ipCounter += 1;
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `10.${(ipCounter >> 8) & 255}.${ipCounter & 255}.88` },
    body: JSON.stringify(body),
  });
}
function getReq(url: string) {
  return new NextRequest(url, { headers: { "x-forwarded-for": "10.0.0.89" } });
}

function asUser(userId: string) {
  getVerifiedToken.mockResolvedValue({ id: userId });
}

describe.skipIf(!hasRealDatabaseUrl)("Airdrop recording (integration, real Postgres)", () => {
  const userIds: string[] = [];
  const tokenIds: string[] = [];
  const airdropIds: string[] = [];

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: { email: `${label}-${randomUUID().slice(0, 8)}@airdroptest.example`, username: `${label}${randomUUID().slice(0, 8)}`.slice(0, 20), password: "x" },
    });
    userIds.push(user.id);
    return user;
  }

  async function createToken(creatorId: string) {
    const token = await prisma.launchedToken.create({
      data: {
        name: "Airdrop Test Token",
        symbol: "ADT",
        imageUrl: "https://uploadthing.com/f/abc",
        supply: "1000000000000",
        decimals: 9,
        feeAmount: "15",
        feeTransactionId: `tx-fee-${randomUUID()}`,
        mintAddress: Keypair.generate().publicKey.toBase58(),
        status: "COMPLETED",
        creatorId,
      },
    });
    tokenIds.push(token.id);
    return token;
  }

  afterAll(async () => {
    await prisma.airdropRecipient.deleteMany({ where: { airdropId: { in: airdropIds } } });
    await prisma.airdrop.deleteMany({ where: { id: { in: airdropIds } } });
    await prisma.launchedToken.deleteMany({ where: { id: { in: tokenIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  beforeEach(() => {
    getVerifiedToken.mockReset();
    verifyAirdropBatchTransaction.mockReset();
  });

  it("rejects recording an airdrop for a token owned by someone else (403)", async () => {
    const owner = await createUser("owner1");
    const impostor = await createUser("impostor1");
    const token = await createToken(owner.id);
    asUser(impostor.id);

    const res = await recordAirdrop(
      req("https://zrp.one/api/launchpad/airdrop", {
        launchedTokenId: token.id,
        senderWalletAddress: Keypair.generate().publicKey.toBase58(),
        amountPerRecipientRaw: "1000",
        batches: [{ outcome: "failed", transactionId: null, recipientWallets: [Keypair.generate().publicKey.toBase58()] }],
      })
    );
    expect(res.status).toBe(403);
  });

  it("records a FAILED batch as reported, with no verification call", async () => {
    const owner = await createUser("owner2");
    const token = await createToken(owner.id);
    asUser(owner.id);
    const recipient = Keypair.generate().publicKey.toBase58();

    const res = await recordAirdrop(
      req("https://zrp.one/api/launchpad/airdrop", {
        launchedTokenId: token.id,
        senderWalletAddress: Keypair.generate().publicKey.toBase58(),
        amountPerRecipientRaw: "1000",
        batches: [{ outcome: "failed", transactionId: null, recipientWallets: [recipient] }],
      })
    );
    const data = await res.json();
    expect(res.status).toBe(201);
    airdropIds.push(data.airdrop.id);
    expect(data.airdrop.recipients).toEqual([{ walletAddress: recipient, status: "FAILED", transactionId: null }]);
    expect(verifyAirdropBatchTransaction).not.toHaveBeenCalled();
  });

  it("downgrades a claimed SUCCESS batch to FAILED when on-chain verification doesn't back it up - never trusts the client's label", async () => {
    const owner = await createUser("owner3");
    const token = await createToken(owner.id);
    asUser(owner.id);
    const recipient = Keypair.generate().publicKey.toBase58();
    const sender = Keypair.generate().publicKey.toBase58();

    verifyAirdropBatchTransaction.mockRejectedValue(new Error("Transaction not found."));

    const res = await recordAirdrop(
      req("https://zrp.one/api/launchpad/airdrop", {
        launchedTokenId: token.id,
        senderWalletAddress: sender,
        amountPerRecipientRaw: "1000",
        batches: [{ outcome: "success", transactionId: `fake-sig-${randomUUID()}`, recipientWallets: [recipient] }],
      })
    );
    const data = await res.json();
    expect(res.status).toBe(201);
    airdropIds.push(data.airdrop.id);
    expect(data.airdrop.recipients[0].status).toBe("FAILED");
  });

  it("happy path: a genuinely verified SUCCESS batch is recorded as SUCCESS", async () => {
    const owner = await createUser("owner4");
    const token = await createToken(owner.id);
    asUser(owner.id);
    const recipient = Keypair.generate().publicKey.toBase58();
    const sender = Keypair.generate().publicKey.toBase58();
    const txId = `real-sig-${randomUUID()}`;

    verifyAirdropBatchTransaction.mockResolvedValue({
      valid: true,
      verifiedRecipients: [{ walletAddress: recipient, rawAmount: BigInt(1000) }],
    });

    const res = await recordAirdrop(
      req("https://zrp.one/api/launchpad/airdrop", {
        launchedTokenId: token.id,
        senderWalletAddress: sender,
        amountPerRecipientRaw: "1000",
        batches: [{ outcome: "success", transactionId: txId, recipientWallets: [recipient] }],
      })
    );
    const data = await res.json();
    expect(res.status).toBe(201);
    airdropIds.push(data.airdrop.id);
    expect(data.airdrop.recipients).toEqual([{ walletAddress: recipient, status: "SUCCESS", transactionId: txId }]);

    // GET history returns it back to the creator.
    asUser(owner.id);
    const historyRes = await getAirdrops(getReq("https://zrp.one/api/launchpad/airdrop"));
    const history = await historyRes.json();
    expect(history.airdrops.some((a: { id: string }) => a.id === data.airdrop.id)).toBe(true);
  });

  it("rejects a batch total exceeding the server-enforced recipient cap (400)", async () => {
    const owner = await createUser("owner5");
    const token = await createToken(owner.id);
    asUser(owner.id);
    const manyWallets = Array.from({ length: 101 }, () => Keypair.generate().publicKey.toBase58());

    const res = await recordAirdrop(
      req("https://zrp.one/api/launchpad/airdrop", {
        launchedTokenId: token.id,
        senderWalletAddress: Keypair.generate().publicKey.toBase58(),
        amountPerRecipientRaw: "1000",
        batches: [{ outcome: "failed", transactionId: null, recipientWallets: manyWallets }],
      })
    );
    expect(res.status).toBe(400);
  });

  it("GET history never leaks another creator's airdrop", async () => {
    const owner = await createUser("owner6");
    const stranger = await createUser("stranger6");
    const token = await createToken(owner.id);
    asUser(owner.id);
    const recipient = Keypair.generate().publicKey.toBase58();

    const res = await recordAirdrop(
      req("https://zrp.one/api/launchpad/airdrop", {
        launchedTokenId: token.id,
        senderWalletAddress: Keypair.generate().publicKey.toBase58(),
        amountPerRecipientRaw: "1000",
        batches: [{ outcome: "failed", transactionId: null, recipientWallets: [recipient] }],
      })
    );
    const { airdrop } = await res.json();
    airdropIds.push(airdrop.id);

    asUser(stranger.id);
    const historyRes = await getAirdrops(getReq("https://zrp.one/api/launchpad/airdrop"));
    const history = await historyRes.json();
    expect(history.airdrops.some((a: { id: string }) => a.id === airdrop.id)).toBe(false);
  });
});
