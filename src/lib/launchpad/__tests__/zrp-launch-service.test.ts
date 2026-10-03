import { describe, it, expect, vi } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  getZrpCurveState,
  getZrpBuyQuote,
  getZrpSellQuote,
  getZrpInitialBuyQuote,
  verifyZrpCreateTransaction,
  verifyZrpTradeTransaction,
  verifyZrpGraduateTransaction,
  checkZrpGraduation,
  ZrpVerificationError,
  deriveZrpLaunchKeys,
} from "../zrp-launch-service";
import { anchorDiscriminator } from "../zrp-launch-keys";

const PUMP_FUN_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const ZRP_PROGRAM_ID = new PublicKey("3vr1SHa9LvEvELb23NBG1J6oFRCSDs8cj8wS55zuoRxK");

function writeU64LE(value: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(value);
  return b;
}
function writeString(s: string): Buffer {
  const bytes = Buffer.from(s, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length);
  return Buffer.concat([len, bytes]);
}

function buildGlobalConfigData(fields: {
  authority?: PublicKey;
  feeRecipient?: PublicKey;
  migrationAuthority?: PublicKey;
  creationFeeLamports?: bigint;
  buyFeeBps?: number;
  sellFeeBps?: number;
  initialVirtualSolReserves?: bigint;
  initialVirtualTokenReserves?: bigint;
  tokenTotalSupply?: bigint;
  graduationSolTarget?: bigint;
  tokenDecimals?: number;
  bump?: number;
}): Buffer {
  const buyFeeBps = Buffer.alloc(2);
  buyFeeBps.writeUInt16LE(fields.buyFeeBps ?? 100);
  const sellFeeBps = Buffer.alloc(2);
  sellFeeBps.writeUInt16LE(fields.sellFeeBps ?? 100);
  return Buffer.concat([
    Buffer.alloc(8),
    (fields.authority ?? PublicKey.default).toBuffer(),
    (fields.feeRecipient ?? PublicKey.default).toBuffer(),
    (fields.migrationAuthority ?? PublicKey.default).toBuffer(),
    writeU64LE(fields.creationFeeLamports ?? BigInt(20_000_000)),
    buyFeeBps,
    sellFeeBps,
    writeU64LE(fields.initialVirtualSolReserves ?? BigInt(30_000_000_000)),
    writeU64LE(fields.initialVirtualTokenReserves ?? BigInt(1_073_000_000_000_000)),
    writeU64LE(fields.tokenTotalSupply ?? BigInt(1_000_000_000_000_000)),
    writeU64LE(fields.graduationSolTarget ?? BigInt(85_000_000_000)),
    Buffer.from([fields.tokenDecimals ?? 6]),
    Buffer.from([fields.bump ?? 255]),
  ]);
}

function buildBondingCurveData(fields: {
  mint: PublicKey;
  creator?: PublicKey;
  virtualSolReserves?: bigint;
  virtualTokenReserves?: bigint;
  realSolReserves?: bigint;
  realTokenReserves?: bigint;
  tokenTotalSupply?: bigint;
  complete?: boolean;
  migrated?: boolean;
}): Buffer {
  return Buffer.concat([
    Buffer.alloc(8),
    fields.mint.toBuffer(),
    (fields.creator ?? PublicKey.default).toBuffer(),
    writeU64LE(fields.virtualSolReserves ?? BigInt(31_000_000_000)),
    writeU64LE(fields.virtualTokenReserves ?? BigInt(900_000_000_000_000)),
    writeU64LE(fields.realSolReserves ?? BigInt(1_000_000_000)),
    writeU64LE(fields.realTokenReserves ?? BigInt(900_000_000_000_000)),
    writeU64LE(fields.tokenTotalSupply ?? BigInt(1_000_000_000_000_000)),
    Buffer.from([fields.complete ? 1 : 0]),
    Buffer.from([fields.migrated ? 1 : 0]),
    writeU64LE(BigInt(1_700_000_000)),
    Buffer.from([254]),
  ]);
}

function connectionWithAccounts(entries: Map<string, Buffer>) {
  return {
    getAccountInfo: vi.fn().mockImplementation(async (pubkey: PublicKey) => {
      const data = entries.get(pubkey.toBase58());
      return data ? { data, owner: ZRP_PROGRAM_ID, executable: false, lamports: 1 } : null;
    }),
  } as any;
}

describe("getZrpCurveState", () => {
  it("reports NO_CURVE when the bonding curve account does not exist", async () => {
    const connection = { getAccountInfo: vi.fn().mockResolvedValue(null) } as any;
    const state = await getZrpCurveState(connection, Keypair.generate().publicKey.toBase58());
    expect(state.status).toBe("NO_CURVE");
  });

  it("reports UNAVAILABLE when the RPC throws", async () => {
    const connection = { getAccountInfo: vi.fn().mockRejectedValue(new Error("rpc down")) } as any;
    const state = await getZrpCurveState(connection, Keypair.generate().publicKey.toBase58());
    expect(state.status).toBe("UNAVAILABLE");
  });

  it("reports OK with graduated=true and progressBps clamped to 10000 past threshold", async () => {
    const mint = Keypair.generate().publicKey;
    const { globalConfig, bondingCurve } = deriveZrpLaunchKeys(mint, ZRP_PROGRAM_ID);
    const entries = new Map<string, Buffer>([
      [globalConfig.toBase58(), buildGlobalConfigData({ graduationSolTarget: BigInt(5_000_000_000) })],
      [bondingCurve.toBase58(), buildBondingCurveData({ mint, realSolReserves: BigInt(10_000_000_000), complete: true })],
    ]);
    const state = await getZrpCurveState(connectionWithAccounts(entries), mint.toBase58());
    expect(state.status).toBe("OK");
    expect(state.graduated).toBe(true);
    expect(state.progressBps).toBe(10_000);
  });
});

describe("getZrpBuyQuote / getZrpSellQuote / getZrpInitialBuyQuote", () => {
  it("getZrpBuyQuote reports NO_CURVE when there is no curve for the mint", async () => {
    const mint = Keypair.generate().publicKey;
    const { globalConfig } = deriveZrpLaunchKeys(mint, ZRP_PROGRAM_ID);
    const entries = new Map<string, Buffer>([[globalConfig.toBase58(), buildGlobalConfigData({})]]);
    const quote = await getZrpBuyQuote(connectionWithAccounts(entries), mint.toBase58(), BigInt(1_000_000_000), 100);
    expect(quote.status).toBe("NO_CURVE");
  });

  it("getZrpBuyQuote reports GRADUATED for a completed curve", async () => {
    const mint = Keypair.generate().publicKey;
    const { globalConfig, bondingCurve } = deriveZrpLaunchKeys(mint, ZRP_PROGRAM_ID);
    const entries = new Map<string, Buffer>([
      [globalConfig.toBase58(), buildGlobalConfigData({})],
      [bondingCurve.toBase58(), buildBondingCurveData({ mint, complete: true })],
    ]);
    const quote = await getZrpBuyQuote(connectionWithAccounts(entries), mint.toBase58(), BigInt(1_000_000_000), 100);
    expect(quote.status).toBe("GRADUATED");
  });

  it("getZrpBuyQuote returns a positive token amount for a live curve", async () => {
    const mint = Keypair.generate().publicKey;
    const { globalConfig, bondingCurve } = deriveZrpLaunchKeys(mint, ZRP_PROGRAM_ID);
    const entries = new Map<string, Buffer>([
      [globalConfig.toBase58(), buildGlobalConfigData({})],
      [bondingCurve.toBase58(), buildBondingCurveData({ mint })],
    ]);
    const quote = await getZrpBuyQuote(connectionWithAccounts(entries), mint.toBase58(), BigInt(1_000_000_000), 100);
    expect(quote.status).toBe("OK");
    expect(BigInt(quote.tokenAmountRaw!)).toBeGreaterThan(BigInt(0));
  });

  it("getZrpSellQuote returns a positive SOL amount for a live curve", async () => {
    const mint = Keypair.generate().publicKey;
    const { globalConfig, bondingCurve } = deriveZrpLaunchKeys(mint, ZRP_PROGRAM_ID);
    const entries = new Map<string, Buffer>([
      [globalConfig.toBase58(), buildGlobalConfigData({})],
      [bondingCurve.toBase58(), buildBondingCurveData({ mint })],
    ]);
    const quote = await getZrpSellQuote(connectionWithAccounts(entries), mint.toBase58(), BigInt(1_000_000), 100);
    expect(quote.status).toBe("OK");
    expect(BigInt(quote.solAmountLamports!)).toBeGreaterThan(BigInt(0));
  });

  it("getZrpInitialBuyQuote uses GlobalConfig's configured starting reserves, no curve account needed", async () => {
    const connection = {
      getAccountInfo: vi.fn().mockResolvedValue({ data: buildGlobalConfigData({}) }),
    } as any;
    const quote = await getZrpInitialBuyQuote(connection, BigInt(1_000_000_000), 100);
    expect(quote.status).toBe("OK");
    expect(BigInt(quote.tokenAmountRaw!)).toBeGreaterThan(BigInt(0));
  });
});

function fakeTransaction(opts: {
  accountKeys: PublicKey[];
  signerCount: number;
  logMessages: string[];
  err?: unknown;
  slot?: number;
  blockTime?: number | null;
}) {
  return {
    slot: opts.slot ?? 123,
    blockTime: opts.blockTime === undefined ? 1_700_000_000 : opts.blockTime,
    meta: { err: opts.err ?? null, logMessages: opts.logMessages },
    transaction: {
      message: {
        getAccountKeys: () => ({ staticAccountKeys: opts.accountKeys }),
        isAccountSigner: (index: number) => index < opts.signerCount,
      },
    },
  };
}

async function buildEventLogLine(eventName: string, body: Buffer): Promise<string> {
  const disc = await anchorDiscriminator("event", eventName);
  return `Program data: ${Buffer.concat([disc, body]).toString("base64")}`;
}

describe("verifyZrpCreateTransaction", () => {
  it("rejects a transaction that does not reference the ZRP program", async () => {
    const connection = {
      getTransaction: vi.fn().mockResolvedValue(
        fakeTransaction({ accountKeys: [new PublicKey("11111111111111111111111111111111")], signerCount: 1, logMessages: [] })
      ),
    } as any;
    await expect(
      verifyZrpCreateTransaction(connection, "sig", { mintAddress: Keypair.generate().publicKey.toBase58(), walletAddress: Keypair.generate().publicKey.toBase58() })
    ).rejects.toThrow(ZrpVerificationError);
  });

  it("rejects a transaction that references Pump.fun's program (the core acceptance test)", async () => {
    const mint = Keypair.generate();
    const wallet = Keypair.generate();
    const connection = {
      getTransaction: vi.fn().mockResolvedValue(
        fakeTransaction({
          accountKeys: [ZRP_PROGRAM_ID, PUMP_FUN_PROGRAM_ID, mint.publicKey, wallet.publicKey],
          signerCount: 4,
          logMessages: [],
        })
      ),
    } as any;
    await expect(
      verifyZrpCreateTransaction(connection, "sig", { mintAddress: mint.publicKey.toBase58(), walletAddress: wallet.publicKey.toBase58() })
    ).rejects.toThrow(/Pump\.fun/);
  });

  it("verifies a real-shaped create transaction and returns the on-chain name/symbol, never the client's", async () => {
    const mint = Keypair.generate();
    const wallet = Keypair.generate();
    const bondingCurve = Keypair.generate().publicKey;
    const body = Buffer.concat([
      mint.publicKey.toBuffer(),
      wallet.publicKey.toBuffer(),
      bondingCurve.toBuffer(),
      writeString("Real On-Chain Name"),
      writeString("REAL"),
      writeString("https://example.com/real.json"),
      writeU64LE(BigInt(30_000_000_000)),
      writeU64LE(BigInt(1_073_000_000_000_000)),
      writeU64LE(BigInt(1_000_000_000_000_000)),
      writeU64LE(BigInt(1_700_000_000)),
    ]);
    const logLine = await buildEventLogLine("TokenCreatedEvent", body);

    const connection = {
      getTransaction: vi.fn().mockResolvedValue(
        fakeTransaction({
          accountKeys: [ZRP_PROGRAM_ID, mint.publicKey, wallet.publicKey],
          signerCount: 3,
          logMessages: [logLine],
        })
      ),
    } as any;

    const result = await verifyZrpCreateTransaction(connection, "sig", {
      mintAddress: mint.publicKey.toBase58(),
      walletAddress: wallet.publicKey.toBase58(),
    });
    expect(result.name).toBe("Real On-Chain Name");
    expect(result.symbol).toBe("REAL");
  });

  it("rejects when the claimed wallet is not the on-chain creator", async () => {
    const mint = Keypair.generate();
    const wallet = Keypair.generate();
    const realCreator = Keypair.generate();
    const bondingCurve = Keypair.generate().publicKey;
    const body = Buffer.concat([
      mint.publicKey.toBuffer(),
      realCreator.publicKey.toBuffer(),
      bondingCurve.toBuffer(),
      writeString("Name"),
      writeString("SYM"),
      writeString("https://example.com/t.json"),
      writeU64LE(BigInt(30_000_000_000)),
      writeU64LE(BigInt(1_073_000_000_000_000)),
      writeU64LE(BigInt(1_000_000_000_000_000)),
      writeU64LE(BigInt(1_700_000_000)),
    ]);
    const logLine = await buildEventLogLine("TokenCreatedEvent", body);
    const connection = {
      getTransaction: vi.fn().mockResolvedValue(
        fakeTransaction({ accountKeys: [ZRP_PROGRAM_ID, mint.publicKey, wallet.publicKey], signerCount: 3, logMessages: [logLine] })
      ),
    } as any;
    await expect(
      verifyZrpCreateTransaction(connection, "sig", { mintAddress: mint.publicKey.toBase58(), walletAddress: wallet.publicKey.toBase58() })
    ).rejects.toThrow(/on-chain creator/);
  });
});

describe("verifyZrpTradeTransaction", () => {
  it("rejects a claimed BUY whose on-chain event was actually a SELL", async () => {
    const mint = Keypair.generate();
    const trader = Keypair.generate();
    const body = Buffer.concat([
      mint.publicKey.toBuffer(),
      trader.publicKey.toBuffer(),
      Buffer.from([0]), // isBuy = false -> SELL
      writeU64LE(BigInt(1_000_000)),
      writeU64LE(BigInt(500_000)),
      writeU64LE(BigInt(10_000)),
      writeU64LE(BigInt(31_000_000_000)),
      writeU64LE(BigInt(900_000_000_000_000)),
      writeU64LE(BigInt(990_000_000)),
      writeU64LE(BigInt(900_000_000_000_000)),
      writeU64LE(BigInt(1_700_000_001)),
    ]);
    const logLine = await buildEventLogLine("TradeEvent", body);
    const connection = {
      getTransaction: vi.fn().mockResolvedValue(
        fakeTransaction({ accountKeys: [ZRP_PROGRAM_ID, trader.publicKey], signerCount: 2, logMessages: [logLine] })
      ),
    } as any;
    await expect(
      verifyZrpTradeTransaction(connection, "sig", { mintAddress: mint.publicKey.toBase58(), walletAddress: trader.publicKey.toBase58(), expectedSide: "BUY" })
    ).rejects.toThrow(/was a SELL/);
  });

  it("verifies a real-shaped BUY and returns the exact on-chain amounts", async () => {
    const mint = Keypair.generate();
    const trader = Keypair.generate();
    const body = Buffer.concat([
      mint.publicKey.toBuffer(),
      trader.publicKey.toBuffer(),
      Buffer.from([1]), // isBuy
      writeU64LE(BigInt(2_000_000_000)),
      writeU64LE(BigInt(70_000_000)),
      writeU64LE(BigInt(20_000_000)),
      writeU64LE(BigInt(32_000_000_000)),
      writeU64LE(BigInt(830_000_000_000_000)),
      writeU64LE(BigInt(1_980_000_000)),
      writeU64LE(BigInt(830_000_000_000_000)),
      writeU64LE(BigInt(1_700_000_002)),
    ]);
    const logLine = await buildEventLogLine("TradeEvent", body);
    const connection = {
      getTransaction: vi.fn().mockResolvedValue(
        fakeTransaction({ accountKeys: [ZRP_PROGRAM_ID, trader.publicKey], signerCount: 2, logMessages: [logLine] })
      ),
    } as any;
    const result = await verifyZrpTradeTransaction(connection, "sig", {
      mintAddress: mint.publicKey.toBase58(),
      walletAddress: trader.publicKey.toBase58(),
      expectedSide: "BUY",
    });
    expect(result.side).toBe("BUY");
    expect(result.tokenAmountRaw).toBe(BigInt(70_000_000));
    expect(result.solAmountLamports).toBe(BigInt(2_000_000_000));
  });
});

describe("verifyZrpGraduateTransaction", () => {
  it("returns the exact swept amounts from the real on-chain GraduateEvent", async () => {
    const mint = Keypair.generate();
    const bondingCurve = Keypair.generate().publicKey;
    const migrationAuthority = Keypair.generate().publicKey;
    const body = Buffer.concat([
      mint.publicKey.toBuffer(),
      bondingCurve.toBuffer(),
      writeU64LE(BigInt(85_000_000_000)),
      writeU64LE(BigInt(50_000_000_000_000)),
      migrationAuthority.toBuffer(),
      writeU64LE(BigInt(1_700_000_003)),
    ]);
    const logLine = await buildEventLogLine("GraduateEvent", body);
    const connection = {
      getTransaction: vi.fn().mockResolvedValue(
        fakeTransaction({ accountKeys: [ZRP_PROGRAM_ID], signerCount: 1, logMessages: [logLine] })
      ),
    } as any;
    const result = await verifyZrpGraduateTransaction(connection, "sig", mint.publicKey.toBase58());
    expect(result.realSolReservesMigratedLamports).toBe("85000000000");
    expect(result.migrationAuthority).toBe(migrationAuthority.toBase58());
  });
});

describe("checkZrpGraduation", () => {
  it("reports graduated=false, migrated=false when there is no curve yet", async () => {
    const connection = { getAccountInfo: vi.fn().mockResolvedValue(null) } as any;
    const result = await checkZrpGraduation(connection, Keypair.generate().publicKey.toBase58());
    expect(result.graduated).toBe(false);
    expect(result.migrated).toBe(false);
  });

  it("reads complete/migrated directly off the curve account - fully deterministic, no heuristic", async () => {
    const mint = Keypair.generate().publicKey;
    const { bondingCurve } = deriveZrpLaunchKeys(mint, ZRP_PROGRAM_ID);
    const connection = connectionWithAccounts(
      new Map([[bondingCurve.toBase58(), buildBondingCurveData({ mint, complete: true, migrated: true })]])
    );
    const result = await checkZrpGraduation(connection, mint.toBase58());
    expect(result.graduated).toBe(true);
    expect(result.migrated).toBe(true);
  });
});
