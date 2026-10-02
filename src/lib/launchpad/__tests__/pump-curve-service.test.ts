import { describe, it, expect, vi } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { getPumpProgram, PUMP_PROGRAM_ID } from "@pump-fun/pump-sdk";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { bondingCurvePda, canonicalPumpPoolPda, CURVE_TOKEN_PROGRAM_ID, PUMP_FEE_CONFIG_PDA } from "../pump-curve-keys";
import {
  getCurveState,
  getBuyQuote,
  getSellQuote,
  verifyCurveTradeTransaction,
  CurveVerificationError,
  checkGraduation,
} from "../pump-curve-service";

function keypair(seed: number): PublicKey {
  return Keypair.fromSeed(new Uint8Array(32).fill(seed)).publicKey;
}

const OFFLINE_PROGRAM = getPumpProgram(null as any);

/**
 * The installed @coral-xyz/anchor's BorshAccountsCoder.encode() hardcodes
 * `Buffer.alloc(1000)` (its own source literally says "TODO: use a
 * tighter buffer") - too small for pump's real `Global` account (23
 * pubkeys alone is 736 bytes, well past 1000 once every other field is
 * added), so the public encode() throws "encoding overruns Buffer" for
 * this account regardless of correct input. This re-implements the same
 * encode logic against the coder's own internal account layout map with a
 * larger buffer, strictly for building test fixtures - production code
 * only ever decodes real on-chain accounts, never encodes them.
 */
function encodeAccountManual(accountName: string, data: Record<string, unknown>): Buffer {
  const coder = OFFLINE_PROGRAM.coder.accounts as unknown as {
    accountLayouts: Map<string, { layout: { encode: (data: unknown, buffer: Buffer) => number } }>;
    accountDiscriminator: (name: string) => Buffer;
  };
  const layout = coder.accountLayouts.get(accountName);
  if (!layout) throw new Error(`Unknown account: ${accountName}`);
  const buffer = Buffer.alloc(4096);
  const len = layout.layout.encode(data, buffer);
  return Buffer.concat([coder.accountDiscriminator(accountName), buffer.subarray(0, len)]);
}

function encodeBondingCurve(fields: {
  virtualTokenReserves: BN;
  virtualQuoteReserves: BN;
  realTokenReserves: BN;
  realQuoteReserves: BN;
  tokenTotalSupply: BN;
  complete: boolean;
  creator?: PublicKey;
  isMayhemMode?: boolean;
  isCashbackCoin?: boolean;
  quoteMint?: PublicKey;
  creatorFeeBps?: BN;
  canEditCreatorFee?: boolean;
  isHolderReward?: boolean;
}): Buffer {
  return encodeAccountManual("bondingCurve", {
    virtualTokenReserves: fields.virtualTokenReserves,
    virtualQuoteReserves: fields.virtualQuoteReserves,
    realTokenReserves: fields.realTokenReserves,
    realQuoteReserves: fields.realQuoteReserves,
    tokenTotalSupply: fields.tokenTotalSupply,
    complete: fields.complete,
    creator: fields.creator ?? PublicKey.default,
    isMayhemMode: fields.isMayhemMode ?? false,
    isCashbackCoin: fields.isCashbackCoin ?? false,
    quoteMint: fields.quoteMint ?? PublicKey.default,
    creatorFeeBps: fields.creatorFeeBps ?? new BN(0),
    canEditCreatorFee: fields.canEditCreatorFee ?? false,
    isHolderReward: fields.isHolderReward ?? false,
  });
}

function encodeGlobal(overrides: Record<string, unknown> = {}): Buffer {
  return encodeAccountManual("global", {
    initialized: true,
    authority: PublicKey.default,
    feeRecipient: keypair(99),
    initialVirtualTokenReserves: new BN("1073000000000000"),
    initialVirtualSolReserves: new BN("30000000000"),
    initialRealTokenReserves: new BN("793100000000000"),
    tokenTotalSupply: new BN("1000000000000000"),
    feeBasisPoints: new BN(100),
    withdrawAuthority: PublicKey.default,
    enableMigrate: true,
    poolMigrationFee: new BN(0),
    creatorFeeBasisPoints: new BN(50),
    // Fixed-size on-chain arrays (not Vecs) - see pump.json's IDL: 7, 7, 8
    // and 1 pubkeys respectively. A shorter array under-fills the layout
    // and borsh-encoding throws "encoding overruns Buffer".
    feeRecipients: Array(7).fill(PublicKey.default),
    setCreatorAuthority: PublicKey.default,
    adminSetCreatorAuthority: PublicKey.default,
    createV2Enabled: true,
    whitelistPda: PublicKey.default,
    reservedFeeRecipient: keypair(98),
    mayhemModeEnabled: false,
    reservedFeeRecipients: Array(7).fill(PublicKey.default),
    isCashbackEnabled: false,
    buybackFeeRecipients: Array(8).fill(PublicKey.default),
    buybackBasisPoints: new BN(0),
    initialVirtualQuoteReserves: new BN(0),
    whitelistedQuoteMints: Array(1).fill(PublicKey.default),
    creatorFeeConfigurable: false,
    maxConfigurableCreatorFeeBps: new BN(0),
    holderRewardClaimAuthority: PublicKey.default,
    isHolderRewardEnabled: false,
    ...overrides,
  });
}

describe("getCurveState", () => {
  it("reports NO_CURVE when the bonding curve account does not exist", async () => {
    const connection = { getAccountInfo: vi.fn().mockResolvedValue(null) } as any;
    const result = await getCurveState(connection, keypair(1).toBase58());
    expect(result.status).toBe("NO_CURVE");
    expect(result.graduated).toBe(false);
  });

  it("reports UNAVAILABLE (not a crash) when the RPC throws", async () => {
    const connection = { getAccountInfo: vi.fn().mockRejectedValue(new Error("rpc down")) } as any;
    const result = await getCurveState(connection, keypair(1).toBase58());
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.reason).toMatch(/rpc down/);
  });

  it("decodes a real curve account and computes exact price/progress from its own reserves", async () => {
    const mint = keypair(2);
    const bondingCurveData = encodeBondingCurve({
      virtualTokenReserves: new BN("800000000000000"),
      virtualQuoteReserves: new BN("40000000000"),
      realTokenReserves: new BN("500000000000000"), // half of initialRealTokenReserves (793.1T... use matching Global below)
      realQuoteReserves: new BN("10000000000"),
      tokenTotalSupply: new BN("1000000000000000"),
      complete: false,
    });
    const globalData = encodeGlobal({ initialRealTokenReserves: new BN("1000000000000000") });

    const connection = {
      getAccountInfo: vi.fn().mockImplementation(async (pubkey: PublicKey) => {
        if (pubkey.equals(bondingCurvePda(mint))) return { data: bondingCurveData };
        return { data: globalData };
      }),
    } as any;

    const result = await getCurveState(connection, mint.toBase58());
    expect(result.status).toBe("OK");
    expect(result.graduated).toBe(false);
    // 50% of real token reserves sold (500T of 1000T remaining = 50% sold).
    expect(result.progressBps).toBe(5_000);
    // price = virtualQuoteLamports / virtualTokenRaw = 40e9 / 800e12 = 0.00005
    expect(result.priceDisplay).toBe("0.00005");
  });

  it("reports graduated: true once the curve's own complete flag is set", async () => {
    const mint = keypair(3);
    const bondingCurveData = encodeBondingCurve({
      virtualTokenReserves: new BN("1073000000000000"),
      virtualQuoteReserves: new BN("30000000000"),
      realTokenReserves: new BN("0"),
      realQuoteReserves: new BN("85000000000"),
      tokenTotalSupply: new BN("1000000000000000"),
      complete: true,
    });
    const globalData = encodeGlobal();
    const connection = {
      getAccountInfo: vi.fn().mockImplementation(async (pubkey: PublicKey) =>
        pubkey.equals(bondingCurvePda(mint)) ? { data: bondingCurveData } : { data: globalData }
      ),
    } as any;

    const result = await getCurveState(connection, mint.toBase58());
    expect(result.status).toBe("OK");
    expect(result.graduated).toBe(true);
    expect(result.progressBps).toBe(10_000);
  });

  it("reports UNSUPPORTED_CURVE_VARIANT for a mayhem-mode curve rather than mis-reading it", async () => {
    const mint = keypair(4);
    const bondingCurveData = encodeBondingCurve({
      virtualTokenReserves: new BN("1073000000000000"),
      virtualQuoteReserves: new BN("30000000000"),
      realTokenReserves: new BN("793100000000000"),
      realQuoteReserves: new BN("0"),
      tokenTotalSupply: new BN("1000000000000000"),
      complete: false,
      isMayhemMode: true,
    });
    const globalData = encodeGlobal();
    const connection = {
      getAccountInfo: vi.fn().mockImplementation(async (pubkey: PublicKey) =>
        pubkey.equals(bondingCurvePda(mint)) ? { data: bondingCurveData } : { data: globalData }
      ),
    } as any;

    const result = await getCurveState(connection, mint.toBase58());
    expect(result.status).toBe("UNSUPPORTED_CURVE_VARIANT");
  });
});

describe("getBuyQuote / getSellQuote", () => {
  async function connectionFor(mint: PublicKey, curveOverrides: Partial<Parameters<typeof encodeBondingCurve>[0]> = {}) {
    const bondingCurveData = encodeBondingCurve({
      virtualTokenReserves: new BN("1073000000000000"),
      virtualQuoteReserves: new BN("30000000000"),
      realTokenReserves: new BN("793100000000000"),
      realQuoteReserves: new BN("0"),
      tokenTotalSupply: new BN("1000000000000000"),
      complete: false,
      creator: keypair(50),
      ...curveOverrides,
    });
    const globalData = encodeGlobal();
    return {
      getAccountInfo: vi.fn().mockImplementation(async (pubkey: PublicKey) => {
        if (pubkey.equals(bondingCurvePda(mint))) return { data: bondingCurveData };
        // No FeeConfig account - computeFeesBps falls back to Global's flat
        // feeBasisPoints/creatorFeeBasisPoints, which is enough to test the
        // quote math without needing a (separately very large) FeeConfig fixture.
        if (pubkey.equals(PUMP_FEE_CONFIG_PDA)) return null;
        return { data: globalData };
      }),
    } as any;
  }

  it("quotes more tokens out as the SOL amount increases (monotonic curve)", async () => {
    const mint = keypair(10);
    const connection = await connectionFor(mint);
    const small = await getBuyQuote(connection, mint.toBase58(), BigInt(1_000_000_000), 100);
    const large = await getBuyQuote(connection, mint.toBase58(), BigInt(2_000_000_000), 100);
    expect(small.status).toBe("OK");
    expect(large.status).toBe("OK");
    expect(BigInt(large.tokenAmountRaw!)).toBeGreaterThan(BigInt(small.tokenAmountRaw!));
  });

  it("applies a minimum-received floor strictly below the quoted amount when slippage > 0", async () => {
    const mint = keypair(11);
    const connection = await connectionFor(mint);
    const quote = await getBuyQuote(connection, mint.toBase58(), BigInt(1_000_000_000), 100); // 1%
    expect(quote.status).toBe("OK");
    expect(BigInt(quote.minimumReceivedRaw!)).toBeLessThan(BigInt(quote.tokenAmountRaw!));
  });

  it("reports GRADUATED and refuses to quote a completed curve", async () => {
    const mint = keypair(12);
    const connection = await connectionFor(mint, { complete: true, realTokenReserves: new BN(0) });
    const quote = await getBuyQuote(connection, mint.toBase58(), BigInt(1_000_000_000), 100);
    expect(quote.status).toBe("GRADUATED");
    expect(quote.tokenAmountRaw).toBeNull();
  });

  it("sell quote returns less SOL than a naive price multiplication would, because of fees", async () => {
    const mint = keypair(13);
    const connection = await connectionFor(mint);
    const quote = await getSellQuote(connection, mint.toBase58(), BigInt(1_000_000_000), 100);
    expect(quote.status).toBe("OK");
    expect(BigInt(quote.totalFeeLamports!)).toBeGreaterThan(BigInt(0));
  });
});

describe("verifyCurveTradeTransaction", () => {
  const mint = keypair(20);
  const wallet = keypair(21);
  const bondingCurve = bondingCurvePda(mint);
  const curveTokenAccount = getAssociatedTokenAddressSync(mint, bondingCurve, true, CURVE_TOKEN_PROGRAM_ID);

  function buildTx(params: { curveSolDelta: number; curveTokenDelta: bigint; signerIndexes?: number[]; accountKeys?: PublicKey[] }) {
    const accountKeys = params.accountKeys ?? [wallet, PUMP_PROGRAM_ID, bondingCurve, curveTokenAccount];
    const curveIndex = accountKeys.findIndex((k) => k.equals(bondingCurve));
    const curveTokenIndex = accountKeys.findIndex((k) => k.equals(curveTokenAccount));
    const preBalances = accountKeys.map(() => 1_000_000_000);
    const postBalances = [...preBalances];
    postBalances[curveIndex] = preBalances[curveIndex] + params.curveSolDelta;
    return {
      slot: 12345,
      blockTime: 1700000000,
      meta: {
        err: null,
        preBalances,
        postBalances,
        preTokenBalances: [{ accountIndex: curveTokenIndex, uiTokenAmount: { amount: "500000000000000" } }],
        postTokenBalances: [
          { accountIndex: curveTokenIndex, uiTokenAmount: { amount: (BigInt(500000000000000) + params.curveTokenDelta).toString() } },
        ],
      },
      transaction: {
        message: {
          getAccountKeys: () => ({ staticAccountKeys: accountKeys }),
          isAccountSigner: (index: number) => (params.signerIndexes ?? [0]).includes(index),
        },
      },
    };
  }

  function fakeConnection(tx: unknown) {
    return { getTransaction: vi.fn().mockResolvedValue(tx) } as any;
  }

  it("verifies a genuine BUY: curve SOL balance up, curve token balance down", async () => {
    const tx = buildTx({ curveSolDelta: 1_000_000_000, curveTokenDelta: BigInt(-2_000_000) });
    const result = await verifyCurveTradeTransaction(fakeConnection(tx), "sig1", {
      mintAddress: mint.toBase58(),
      walletAddress: wallet.toBase58(),
      expectedSide: "BUY",
    });
    expect(result.side).toBe("BUY");
    expect(result.tokenAmountRaw).toBe(BigInt(2_000_000));
    expect(result.solAmountLamports).toBe(BigInt(1_000_000_000));
  });

  it("verifies a genuine SELL: curve SOL balance down, curve token balance up", async () => {
    const tx = buildTx({ curveSolDelta: -1_000_000_000, curveTokenDelta: BigInt(2_000_000) });
    const result = await verifyCurveTradeTransaction(fakeConnection(tx), "sig2", {
      mintAddress: mint.toBase58(),
      walletAddress: wallet.toBase58(),
      expectedSide: "SELL",
    });
    expect(result.side).toBe("SELL");
  });

  it("rejects a transaction where the curve's two legs move the wrong way (not a valid trade)", async () => {
    const tx = buildTx({ curveSolDelta: 1_000_000_000, curveTokenDelta: BigInt(2_000_000) }); // both up - invalid
    await expect(
      verifyCurveTradeTransaction(fakeConnection(tx), "sig3", { mintAddress: mint.toBase58(), walletAddress: wallet.toBase58(), expectedSide: "BUY" })
    ).rejects.toBeInstanceOf(CurveVerificationError);
  });

  it("rejects when the claimed side doesn't match what actually happened (anti-spoofing)", async () => {
    const tx = buildTx({ curveSolDelta: 1_000_000_000, curveTokenDelta: BigInt(-2_000_000) }); // a real BUY
    await expect(
      verifyCurveTradeTransaction(fakeConnection(tx), "sig4", { mintAddress: mint.toBase58(), walletAddress: wallet.toBase58(), expectedSide: "SELL" })
    ).rejects.toMatchObject({ status: "ON_CHAIN_FAILURE" });
  });

  it("rejects when the claimed wallet never signed the transaction", async () => {
    const tx = buildTx({ curveSolDelta: 1_000_000_000, curveTokenDelta: BigInt(-2_000_000), signerIndexes: [1] }); // program "signs" instead
    await expect(
      verifyCurveTradeTransaction(fakeConnection(tx), "sig5", { mintAddress: mint.toBase58(), walletAddress: wallet.toBase58(), expectedSide: "BUY" })
    ).rejects.toMatchObject({ status: "ON_CHAIN_FAILURE" });
  });

  it("reports NOT_FOUND_YET (retryable) rather than a hard failure when the RPC hasn't seen the signature", async () => {
    await expect(
      verifyCurveTradeTransaction(fakeConnection(null), "sig6", { mintAddress: mint.toBase58(), walletAddress: wallet.toBase58(), expectedSide: "BUY" })
    ).rejects.toMatchObject({ status: "NOT_FOUND_YET" });
  });

  it("rejects a transaction that failed on-chain", async () => {
    const tx = buildTx({ curveSolDelta: 1_000_000_000, curveTokenDelta: BigInt(-2_000_000) });
    (tx.meta as any).err = { Custom: 1 };
    await expect(
      verifyCurveTradeTransaction(fakeConnection(tx), "sig7", { mintAddress: mint.toBase58(), walletAddress: wallet.toBase58(), expectedSide: "BUY" })
    ).rejects.toMatchObject({ status: "ON_CHAIN_FAILURE" });
  });
});

describe("checkGraduation", () => {
  it("reports graduated: false when there is no curve account at all", async () => {
    const connection = { getAccountInfo: vi.fn().mockResolvedValue(null) } as any;
    const result = await checkGraduation(connection, keypair(30).toBase58());
    expect(result.graduated).toBe(false);
    expect(result.poolAddress).toBeNull();
  });

  it("reports graduated: false while complete is still false, even with real reserves near zero", async () => {
    const mint = keypair(31);
    const data = encodeBondingCurve({
      virtualTokenReserves: new BN(1),
      virtualQuoteReserves: new BN(1),
      realTokenReserves: new BN(1),
      realQuoteReserves: new BN(1),
      tokenTotalSupply: new BN(1),
      complete: false,
    });
    const connection = { getAccountInfo: vi.fn().mockResolvedValue({ data }) } as any;
    const result = await checkGraduation(connection, mint.toBase58());
    expect(result.graduated).toBe(false);
  });

  it("reports graduated: true with the real canonical pool address once complete is set", async () => {
    const mint = keypair(32);
    const curveData = encodeBondingCurve({
      virtualTokenReserves: new BN(1),
      virtualQuoteReserves: new BN(1),
      realTokenReserves: new BN(0),
      realQuoteReserves: new BN(1),
      tokenTotalSupply: new BN(1),
      complete: true,
    });
    const pool = canonicalPumpPoolPda(mint);
    const connection = {
      getAccountInfo: vi.fn().mockImplementation(async (pubkey: PublicKey) =>
        pubkey.equals(bondingCurvePda(mint)) ? { data: curveData } : pubkey.equals(pool) ? { data: Buffer.alloc(1) } : null
      ),
      getSignaturesForAddress: vi.fn().mockResolvedValue([{ signature: "realSig", slot: 42, blockTime: 1700000000 }]),
    } as any;

    const result = await checkGraduation(connection, mint.toBase58());
    expect(result.graduated).toBe(true);
    expect(result.poolAddress).toBe(pool.toBase58());
    expect(result.poolAccountExists).toBe(true);
    expect(result.anchorSignature).toBe("realSig");
  });
});
