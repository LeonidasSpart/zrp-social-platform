import { describe, it, expect, vi, beforeEach } from "vitest";
import { Keypair } from "@solana/web3.js";
import { CREATE_CPMM_POOL_PROGRAM } from "@raydium-io/raydium-sdk-v2";

const { findUniqueTrade, findUniqueLiquidityEvent, createTrade, upsertSyncState, updateSyncState } = vi.hoisted(() => ({
  findUniqueTrade: vi.fn(),
  findUniqueLiquidityEvent: vi.fn(),
  createTrade: vi.fn(),
  upsertSyncState: vi.fn(),
  updateSyncState: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    tokenTrade: { findUnique: findUniqueTrade, create: createTrade, findMany: vi.fn().mockResolvedValue([]) },
    liquidityEvent: { findUnique: findUniqueLiquidityEvent },
    tokenVolumeSyncState: { upsert: upsertSyncState, update: updateSyncState },
  },
}));

import { syncPoolVolume } from "../volume-index-service";

function keypair(seed: number) {
  return Keypair.fromSeed(new Uint8Array(32).fill(seed)).publicKey;
}

const POOL = { id: "pool1", poolAddress: keypair(1).toBase58(), baseVault: keypair(2).toBase58(), quoteVault: keypair(3).toBase58(), baseMint: keypair(4).toBase58() };

function buildSwapTx(params: { baseDelta: bigint; quoteDelta: bigint; signer: ReturnType<typeof keypair> }) {
  const accountKeys = [params.signer, CREATE_CPMM_POOL_PROGRAM, keypair(2), keypair(3)];
  return {
    meta: {
      err: null,
      preTokenBalances: [
        { accountIndex: 2, uiTokenAmount: { amount: "1000" } },
        { accountIndex: 3, uiTokenAmount: { amount: "2000" } },
      ],
      postTokenBalances: [
        { accountIndex: 2, uiTokenAmount: { amount: String(BigInt(1000) + params.baseDelta) } },
        { accountIndex: 3, uiTokenAmount: { amount: String(BigInt(2000) + params.quoteDelta) } },
      ],
    },
    transaction: {
      message: {
        getAccountKeys: () => ({ staticAccountKeys: accountKeys }),
        isAccountSigner: (i: number) => i === 0,
      },
    },
  };
}

function buildLiquidityTx() {
  // Both vaults move the SAME direction - a liquidity event, not a swap.
  const accountKeys = [keypair(9), CREATE_CPMM_POOL_PROGRAM, keypair(2), keypair(3)];
  return {
    meta: {
      err: null,
      preTokenBalances: [
        { accountIndex: 2, uiTokenAmount: { amount: "1000" } },
        { accountIndex: 3, uiTokenAmount: { amount: "2000" } },
      ],
      postTokenBalances: [
        { accountIndex: 2, uiTokenAmount: { amount: "1100" } },
        { accountIndex: 3, uiTokenAmount: { amount: "2200" } },
      ],
    },
    transaction: { message: { getAccountKeys: () => ({ staticAccountKeys: accountKeys }), isAccountSigner: () => false } },
  };
}

describe("syncPoolVolume", () => {
  beforeEach(() => {
    findUniqueTrade.mockReset().mockResolvedValue(null);
    findUniqueLiquidityEvent.mockReset().mockResolvedValue(null);
    createTrade.mockReset().mockResolvedValue({});
    upsertSyncState.mockReset().mockResolvedValue({ lastSignature: null });
    updateSyncState.mockReset().mockResolvedValue({});
  });

  it("records a genuine swap (opposite-direction vault deltas) as a TokenTrade with the correct side", async () => {
    const trader = keypair(5);
    const connection = {
      getSignaturesForAddress: vi.fn().mockResolvedValueOnce([{ signature: "sig1", err: null, blockTime: 1000, slot: 1 }]).mockResolvedValueOnce([]),
      getTransaction: vi.fn().mockResolvedValue(buildSwapTx({ baseDelta: BigInt(-50), quoteDelta: BigInt(100), signer: trader })),
    } as any;

    const result = await syncPoolVolume(connection, POOL);
    expect(result.error).toBeNull();
    expect(result.tradesRecorded).toBe(1);
    expect(createTrade).toHaveBeenCalledTimes(1);
    const data = createTrade.mock.calls[0][0].data;
    expect(data.side).toBe("BUY"); // base vault balance fell -> trader bought base
    expect(data.baseAmountRaw).toBe("50");
    expect(data.quoteAmountRaw).toBe("100");
    expect(data.walletAddress).toBe(trader.toBase58());
  });

  it("does not record a liquidity add/remove (same-direction vault deltas) as a trade", async () => {
    const connection = {
      getSignaturesForAddress: vi.fn().mockResolvedValueOnce([{ signature: "sig1", err: null, blockTime: 1000, slot: 1 }]).mockResolvedValueOnce([]),
      getTransaction: vi.fn().mockResolvedValue(buildLiquidityTx()),
    } as any;

    const result = await syncPoolVolume(connection, POOL);
    expect(result.tradesRecorded).toBe(0);
    expect(createTrade).not.toHaveBeenCalled();
  });

  it("skips a signature already recorded as a LiquidityEvent, so the two indexers never double-count", async () => {
    findUniqueLiquidityEvent.mockResolvedValue({ id: "evt1" });
    const connection = {
      getSignaturesForAddress: vi.fn().mockResolvedValueOnce([{ signature: "sig1", err: null, blockTime: 1000, slot: 1 }]).mockResolvedValueOnce([]),
      getTransaction: vi.fn(),
    } as any;

    const result = await syncPoolVolume(connection, POOL);
    expect(result.tradesRecorded).toBe(0);
    expect(connection.getTransaction).not.toHaveBeenCalled();
  });

  it("skips a failed transaction (err set on the signature info) without an extra RPC round trip", async () => {
    const connection = {
      getSignaturesForAddress: vi.fn().mockResolvedValueOnce([{ signature: "sig1", err: { InstructionError: [] }, blockTime: 1000, slot: 1 }]).mockResolvedValueOnce([]),
      getTransaction: vi.fn(),
    } as any;

    const result = await syncPoolVolume(connection, POOL);
    expect(result.tradesRecorded).toBe(0);
    expect(connection.getTransaction).not.toHaveBeenCalled();
  });

  it("captures an RPC error on the result rather than throwing, so one pool's failure never blocks the cron run", async () => {
    const connection = { getSignaturesForAddress: vi.fn().mockRejectedValue(new Error("RPC unavailable")) } as any;
    const result = await syncPoolVolume(connection, POOL);
    expect(result.error).toMatch(/RPC unavailable/);
  });
});
