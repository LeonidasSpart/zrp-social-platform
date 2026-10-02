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
  getInitialBuyQuote,
  verifyCurveTradeTransaction,
  verifyCreateTransaction,
  CurveVerificationError,
  checkGraduation,
  findVerifiedMigration,
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

describe("getInitialBuyQuote", () => {
  it("quotes a positive token amount against the fresh initial curve (no curve account needed yet)", async () => {
    const globalData = encodeGlobal({ initialRealTokenReserves: new BN("793100000000000") });
    const connection = {
      getAccountInfo: vi.fn().mockImplementation(async (pubkey: PublicKey) =>
        pubkey.equals(PUMP_FEE_CONFIG_PDA) ? null : { data: globalData }
      ),
    } as any;

    const quote = await getInitialBuyQuote(connection, BigInt(1_000_000_000), 100);
    expect(quote.status).toBe("OK");
    expect(BigInt(quote.tokenAmountRaw!)).toBeGreaterThan(BigInt(0));
    // A brand-new curve has no on-chain creator yet (PublicKey.default placeholder),
    // so isNewBondingCurve must still charge the real creator-fee rate -
    // the total fee for a non-zero buy should never be zero.
    expect(BigInt(quote.totalFeeLamports!)).toBeGreaterThan(BigInt(0));
  });

  it("quotes more tokens out as the SOL amount increases, same monotonic curve as an existing one", async () => {
    const globalData = encodeGlobal({ initialRealTokenReserves: new BN("793100000000000") });
    const connection = {
      getAccountInfo: vi.fn().mockImplementation(async (pubkey: PublicKey) =>
        pubkey.equals(PUMP_FEE_CONFIG_PDA) ? null : { data: globalData }
      ),
    } as any;

    const small = await getInitialBuyQuote(connection, BigInt(1_000_000_000), 100);
    const large = await getInitialBuyQuote(connection, BigInt(2_000_000_000), 100);
    expect(BigInt(large.tokenAmountRaw!)).toBeGreaterThan(BigInt(small.tokenAmountRaw!));
  });

  // Global-fetch-failure -> UNAVAILABLE is already covered by
  // getCurveState's own dedicated test; not re-tested here because this
  // module's 30s in-process Global cache (shared across every test in this
  // file, keyed process-wide rather than per-connection) can mask a fresh
  // failure behind an earlier test's successful fetch within the same run.
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

describe("verifyCreateTransaction", () => {
  function createEventLogs(mint: PublicKey, bondingCurve: PublicKey, creator: PublicKey): string[] {
    const data = {
      name: "Real Token",
      symbol: "REAL",
      uri: "https://example.com/metadata.json",
      mint,
      bondingCurve,
      user: creator,
      creator,
      timestamp: new BN(1_700_000_000),
      virtualTokenReserves: new BN("1073000000000000"),
      virtualSolReserves: new BN("30000000000"),
      realTokenReserves: new BN("793100000000000"),
      tokenTotalSupply: new BN("1000000000000000"),
      tokenProgram: PublicKey.default,
      isMayhemMode: false,
      isCashbackEnabled: false,
      quoteMint: PublicKey.default,
      virtualQuoteReserves: new BN("30000000000"),
      creatorFeeBps: new BN(0),
      isHolderReward: false,
    };
    const encoded = OFFLINE_PROGRAM.coder.types.encode("createEvent", data);
    const idl = OFFLINE_PROGRAM.idl as unknown as { events: Array<{ name: string; discriminator: number[] }> };
    const discriminator = Buffer.from(idl.events.find((e) => e.name === "createEvent")!.discriminator);
    const payload = Buffer.concat([discriminator, encoded]).toString("base64");
    return [
      `Program ${PUMP_PROGRAM_ID.toBase58()} invoke [1]`,
      `Program data: ${payload}`,
      `Program ${PUMP_PROGRAM_ID.toBase58()} success`,
    ];
  }

  function buildCreateTx(params: { mint: PublicKey; creator: PublicKey; accountKeys: PublicKey[]; signerIndexes: number[]; err?: unknown; logs?: string[] }) {
    const bondingCurve = bondingCurvePda(params.mint);
    return {
      slot: 999,
      blockTime: 1_700_000_000,
      meta: {
        err: params.err ?? null,
        logMessages: params.logs ?? createEventLogs(params.mint, bondingCurve, params.creator),
      },
      transaction: {
        message: {
          getAccountKeys: () => ({ staticAccountKeys: params.accountKeys }),
          isAccountSigner: (index: number) => params.signerIndexes.includes(index),
        },
      },
    };
  }

  function fakeConnection(tx: unknown) {
    return { getTransaction: vi.fn().mockResolvedValue(tx) } as any;
  }

  it("verifies a genuine create_v2 transaction and returns the real on-chain name/symbol", async () => {
    const mint = keypair(60);
    const creator = keypair(61);
    const accountKeys = [mint, creator, PUMP_PROGRAM_ID];
    const tx = buildCreateTx({ mint, creator, accountKeys, signerIndexes: [0, 1] });

    const result = await verifyCreateTransaction(fakeConnection(tx), "createSig1", {
      mintAddress: mint.toBase58(),
      walletAddress: creator.toBase58(),
    });
    expect(result.name).toBe("Real Token");
    expect(result.symbol).toBe("REAL");
    expect(result.bondingCurveAddress).toBe(bondingCurvePda(mint).toBase58());
  });

  it("rejects when the new mint did not sign the transaction", async () => {
    const mint = keypair(62);
    const creator = keypair(63);
    const accountKeys = [mint, creator, PUMP_PROGRAM_ID];
    const tx = buildCreateTx({ mint, creator, accountKeys, signerIndexes: [1] }); // mint (index 0) not a signer
    await expect(
      verifyCreateTransaction(fakeConnection(tx), "createSig2", { mintAddress: mint.toBase58(), walletAddress: creator.toBase58() })
    ).rejects.toMatchObject({ status: "ON_CHAIN_FAILURE" });
  });

  it("rejects when the claimed wallet never signed the transaction", async () => {
    const mint = keypair(64);
    const creator = keypair(65);
    const accountKeys = [mint, creator, PUMP_PROGRAM_ID];
    const tx = buildCreateTx({ mint, creator, accountKeys, signerIndexes: [0] }); // creator (index 1) not a signer
    await expect(
      verifyCreateTransaction(fakeConnection(tx), "createSig3", { mintAddress: mint.toBase58(), walletAddress: creator.toBase58() })
    ).rejects.toMatchObject({ status: "ON_CHAIN_FAILURE" });
  });

  it("rejects when the claimed wallet is not the real on-chain creator (anti-replay)", async () => {
    const mint = keypair(66);
    const realCreator = keypair(67);
    const impostor = keypair(68);
    const accountKeys = [mint, realCreator, impostor, PUMP_PROGRAM_ID];
    const tx = buildCreateTx({ mint, creator: realCreator, accountKeys, signerIndexes: [0, 2] });
    await expect(
      verifyCreateTransaction(fakeConnection(tx), "createSig4", { mintAddress: mint.toBase58(), walletAddress: impostor.toBase58() })
    ).rejects.toMatchObject({ status: "ON_CHAIN_FAILURE" });
  });

  it("rejects when no CreateEvent is found in the transaction logs", async () => {
    const mint = keypair(69);
    const creator = keypair(70);
    const accountKeys = [mint, creator, PUMP_PROGRAM_ID];
    const tx = buildCreateTx({ mint, creator, accountKeys, signerIndexes: [0, 1], logs: ["Program log: unrelated"] });
    await expect(
      verifyCreateTransaction(fakeConnection(tx), "createSig5", { mintAddress: mint.toBase58(), walletAddress: creator.toBase58() })
    ).rejects.toMatchObject({ status: "ON_CHAIN_FAILURE" });
  });

  it("reports NOT_FOUND_YET (retryable) rather than a hard failure when the RPC hasn't seen the signature", async () => {
    await expect(
      verifyCreateTransaction(fakeConnection(null), "createSig6", { mintAddress: keypair(71).toBase58(), walletAddress: keypair(72).toBase58() })
    ).rejects.toMatchObject({ status: "NOT_FOUND_YET" });
  });

  it("rejects a transaction that failed on-chain", async () => {
    const mint = keypair(73);
    const creator = keypair(74);
    const accountKeys = [mint, creator, PUMP_PROGRAM_ID];
    const tx = buildCreateTx({ mint, creator, accountKeys, signerIndexes: [0, 1], err: { Custom: 1 } });
    await expect(
      verifyCreateTransaction(fakeConnection(tx), "createSig7", { mintAddress: mint.toBase58(), walletAddress: creator.toBase58() })
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

describe("findVerifiedMigration", () => {
  function migrationLogs(mint: PublicKey, pool: PublicKey): string[] {
    const data = {
      user: keypair(1),
      mint,
      mintAmount: new BN("793100000000"),
      solAmount: new BN("85000000000"),
      poolMigrationFee: new BN("500000000"),
      bondingCurve: bondingCurvePda(mint),
      timestamp: new BN(1_700_000_300),
      pool,
      quoteMint: PublicKey.default,
    };
    const encoded = OFFLINE_PROGRAM.coder.types.encode("completePumpAmmMigrationEvent", data);
    const idl = OFFLINE_PROGRAM.idl as unknown as { events: Array<{ name: string; discriminator: number[] }> };
    const discriminator = Buffer.from(idl.events.find((e) => e.name === "completePumpAmmMigrationEvent")!.discriminator);
    const payload = Buffer.concat([discriminator, encoded]).toString("base64");
    return [
      `Program ${PUMP_PROGRAM_ID.toBase58()} invoke [1]`,
      `Program data: ${payload}`,
      `Program ${PUMP_PROGRAM_ID.toBase58()} success`,
    ];
  }

  it("finds and decodes the real migration event among recent curve signatures", async () => {
    const mint = keypair(40);
    const pool = canonicalPumpPoolPda(mint);
    const connection = {
      getSignaturesForAddress: vi.fn().mockResolvedValue([
        { signature: "unrelatedTradeSig", slot: 10, err: null },
        { signature: "migrationSig", slot: 11, err: null },
      ]),
      getTransaction: vi.fn().mockImplementation(async (sig: string) => {
        if (sig === "migrationSig") {
          return { slot: 11, blockTime: 1_700_000_300, meta: { logMessages: migrationLogs(mint, pool) } };
        }
        return { slot: 10, blockTime: 1_699_999_000, meta: { logMessages: ["Program log: some unrelated buy"] } };
      }),
    } as any;

    const result = await findVerifiedMigration(connection, mint.toBase58());
    expect(result).not.toBeNull();
    expect(result!.poolAddress).toBe(pool.toBase58());
    expect(result!.signature).toBe("migrationSig");
    expect(result!.mintAmountRaw).toBe("793100000000");
    expect(result!.solAmountLamports).toBe("85000000000");
    expect(result!.poolMigrationFeeLamports).toBe("500000000");
  });

  it("skips failed transactions and returns null when no migration event is found in the window", async () => {
    const mint = keypair(41);
    const connection = {
      getSignaturesForAddress: vi.fn().mockResolvedValue([{ signature: "failedSig", slot: 1, err: { InstructionError: [0, {}] } }]),
      getTransaction: vi.fn(),
    } as any;

    const result = await findVerifiedMigration(connection, mint.toBase58());
    expect(result).toBeNull();
    expect(connection.getTransaction).not.toHaveBeenCalled();
  });

  it("returns null (never fabricates) when the signature history is empty", async () => {
    const connection = { getSignaturesForAddress: vi.fn().mockResolvedValue([]) } as any;
    const result = await findVerifiedMigration(connection, keypair(42).toBase58());
    expect(result).toBeNull();
  });
});
