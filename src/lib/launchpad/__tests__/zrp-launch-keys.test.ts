import { describe, expect, it } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { createHash } from "crypto";
import {
  deriveZrpLaunchKeys,
  quoteZrpBuy,
  quoteZrpSell,
  applySlippageDown,
  applySlippageUp,
  anchorDiscriminator,
  encodeCreateAndBuyIx,
  encodeBuyIx,
  encodeSellIx,
  encodeGraduateIx,
  decodeGlobalConfig,
  decodeBondingCurve,
  parseTokenCreatedEvents,
  parseTradeEvents,
  parseGraduateEvents,
} from "../zrp-launch-keys";

const PROGRAM_ID = new PublicKey("3vr1SHa9LvEvELb23NBG1J6oFRCSDs8cj8wS55zuoRxK");

describe("deriveZrpLaunchKeys", () => {
  it("is deterministic for a given mint and program ID", () => {
    const mint = Keypair.generate().publicKey;
    const a = deriveZrpLaunchKeys(mint, PROGRAM_ID);
    const b = deriveZrpLaunchKeys(mint, PROGRAM_ID);
    expect(a.globalConfig.toBase58()).toBe(b.globalConfig.toBase58());
    expect(a.bondingCurve.toBase58()).toBe(b.bondingCurve.toBase58());
    expect(a.metadata.toBase58()).toBe(b.metadata.toBase58());
  });

  it("derives a different bonding curve per mint, but the same global config", () => {
    const mintA = Keypair.generate().publicKey;
    const mintB = Keypair.generate().publicKey;
    const a = deriveZrpLaunchKeys(mintA, PROGRAM_ID);
    const b = deriveZrpLaunchKeys(mintB, PROGRAM_ID);
    expect(a.bondingCurve.toBase58()).not.toBe(b.bondingCurve.toBase58());
    expect(a.globalConfig.toBase58()).toBe(b.globalConfig.toBase58());
  });
});

describe("quoteZrpBuy / quoteZrpSell", () => {
  const VIRTUAL_SOL = BigInt(30_000_000_000); // 30 SOL
  const VIRTUAL_TOKEN = BigInt(1_073_000_000_000_000);

  it("a buy never returns more tokens than real reserves would allow to go negative (monotonic increasing output for increasing input)", () => {
    const small = quoteZrpBuy(VIRTUAL_SOL, VIRTUAL_TOKEN, BigInt(1_000_000_000), 100);
    const large = quoteZrpBuy(VIRTUAL_SOL, VIRTUAL_TOKEN, BigInt(2_000_000_000), 100);
    expect(large.tokenOut).toBeGreaterThan(small.tokenOut);
  });

  it("charges exactly buyFeeBps of the gross SOL input", () => {
    const solIn = BigInt(10_000_000_000);
    const { feeLamports } = quoteZrpBuy(VIRTUAL_SOL, VIRTUAL_TOKEN, solIn, 100);
    expect(feeLamports).toBe((solIn * BigInt(100)) / BigInt(10_000));
  });

  it("a buy followed by the inverse sell returns slightly less SOL than was paid in (fees + rounding), never more", () => {
    const solIn = BigInt(5_000_000_000);
    const buy = quoteZrpBuy(VIRTUAL_SOL, VIRTUAL_TOKEN, solIn, 100);
    const newVirtualSol = VIRTUAL_SOL + (solIn - buy.feeLamports);
    const newVirtualToken = VIRTUAL_TOKEN - buy.tokenOut;
    const sell = quoteZrpSell(newVirtualSol, newVirtualToken, buy.tokenOut, 100);
    expect(sell.solOut).toBeLessThan(solIn);
  });

  it("returns zero for a zero-amount request", () => {
    expect(quoteZrpBuy(VIRTUAL_SOL, VIRTUAL_TOKEN, BigInt(0), 100).tokenOut).toBe(BigInt(0));
    expect(quoteZrpSell(VIRTUAL_SOL, VIRTUAL_TOKEN, BigInt(0), 100).solOut).toBe(BigInt(0));
  });
});

describe("applySlippageDown / applySlippageUp", () => {
  it("moves the amount in the expected direction by exactly the bps given", () => {
    const amount = BigInt(1_000_000);
    expect(applySlippageDown(amount, 100)).toBe(BigInt(990_000));
    expect(applySlippageUp(amount, 100)).toBe(BigInt(1_010_000));
  });
});

describe("anchorDiscriminator", () => {
  it("matches a plain sha256 of the same preimage, truncated to 8 bytes", async () => {
    const got = await anchorDiscriminator("global", "initialize");
    const expected = createHash("sha256").update("global:initialize").digest().subarray(0, 8);
    expect(got.equals(expected)).toBe(true);
  });

  it("differs between the global/account/event namespaces for the same name", async () => {
    const g = await anchorDiscriminator("global", "Foo");
    const a = await anchorDiscriminator("account", "Foo");
    const e = await anchorDiscriminator("event", "Foo");
    expect(g.equals(a)).toBe(false);
    expect(g.equals(e)).toBe(false);
    expect(a.equals(e)).toBe(false);
  });
});

describe("instruction encoders", () => {
  it("create_and_buy starts with the correct 8-byte discriminator and is otherwise non-empty", async () => {
    const ix = await encodeCreateAndBuyIx({
      name: "Test",
      symbol: "TST",
      uri: "https://example.com/t.json",
      initialBuyLamports: BigInt(1_000_000_000),
      minTokensOut: BigInt(1),
    });
    const expectedDisc = await anchorDiscriminator("global", "create_and_buy");
    expect(ix.subarray(0, 8).equals(expectedDisc)).toBe(true);
    expect(ix.length).toBeGreaterThan(8);
  });

  it("buy/sell encode to discriminator + 16 bytes (two u64 args)", async () => {
    const buyIx = await encodeBuyIx({ solIn: BigInt(1), minTokensOut: BigInt(1) });
    const sellIx = await encodeSellIx({ tokenIn: BigInt(1), minSolOut: BigInt(1) });
    expect(buyIx.length).toBe(8 + 16);
    expect(sellIx.length).toBe(8 + 16);
  });

  it("graduate encodes to exactly the 8-byte discriminator (no args)", async () => {
    const ix = await encodeGraduateIx();
    expect(ix.length).toBe(8);
  });
});

describe("account decoders", () => {
  function writeU64LE(value: bigint): Buffer {
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(value);
    return b;
  }

  it("round-trips a hand-built GlobalConfig account buffer", () => {
    const authority = Keypair.generate().publicKey;
    const feeRecipient = Keypair.generate().publicKey;
    const migrationAuthority = Keypair.generate().publicKey;

    const buyFeeBps = Buffer.alloc(2);
    buyFeeBps.writeUInt16LE(100);
    const sellFeeBps = Buffer.alloc(2);
    sellFeeBps.writeUInt16LE(150);

    const data = Buffer.concat([
      Buffer.alloc(8), // discriminator (not checked by decodeGlobalConfig)
      authority.toBuffer(),
      feeRecipient.toBuffer(),
      migrationAuthority.toBuffer(),
      writeU64LE(BigInt(20_000_000)),
      buyFeeBps,
      sellFeeBps,
      writeU64LE(BigInt(30_000_000_000)),
      writeU64LE(BigInt(1_073_000_000_000_000)),
      writeU64LE(BigInt(1_000_000_000_000_000)),
      writeU64LE(BigInt(85_000_000_000)),
      Buffer.from([6]), // decimals
      Buffer.from([255]), // bump
    ]);

    const decoded = decodeGlobalConfig(data);
    expect(decoded.authority.toBase58()).toBe(authority.toBase58());
    expect(decoded.feeRecipient.toBase58()).toBe(feeRecipient.toBase58());
    expect(decoded.migrationAuthority.toBase58()).toBe(migrationAuthority.toBase58());
    expect(decoded.creationFeeLamports).toBe(BigInt(20_000_000));
    expect(decoded.buyFeeBps).toBe(100);
    expect(decoded.sellFeeBps).toBe(150);
    expect(decoded.graduationSolTarget).toBe(BigInt(85_000_000_000));
    expect(decoded.tokenDecimals).toBe(6);
    expect(decoded.bump).toBe(255);
  });

  it("round-trips a hand-built BondingCurve account buffer", () => {
    const mint = Keypair.generate().publicKey;
    const creator = Keypair.generate().publicKey;

    const data = Buffer.concat([
      Buffer.alloc(8),
      mint.toBuffer(),
      creator.toBuffer(),
      writeU64LE(BigInt(31_000_000_000)),
      writeU64LE(BigInt(1_000_000_000_000_000)),
      writeU64LE(BigInt(1_000_000_000)),
      writeU64LE(BigInt(900_000_000_000_000)),
      writeU64LE(BigInt(1_073_000_000_000_000)),
      Buffer.from([0]), // complete
      Buffer.from([1]), // migrated
      writeU64LE(BigInt(1_700_000_000)),
      Buffer.from([254]), // bump
    ]);

    const decoded = decodeBondingCurve(data);
    expect(decoded.mint.toBase58()).toBe(mint.toBase58());
    expect(decoded.creator.toBase58()).toBe(creator.toBase58());
    expect(decoded.complete).toBe(false);
    expect(decoded.migrated).toBe(true);
    expect(decoded.realSolReserves).toBe(BigInt(1_000_000_000));
    expect(decoded.bump).toBe(254);
  });
});

describe("event log parsing", () => {
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

  async function buildProgramDataLine(eventName: string, body: Buffer): Promise<string> {
    const disc = await anchorDiscriminator("event", eventName);
    return `Program data: ${Buffer.concat([disc, body]).toString("base64")}`;
  }

  it("parses a TokenCreatedEvent out of real-shaped log lines and ignores unrelated lines", async () => {
    const mint = Keypair.generate().publicKey;
    const creator = Keypair.generate().publicKey;
    const bondingCurve = Keypair.generate().publicKey;
    const body = Buffer.concat([
      mint.toBuffer(),
      creator.toBuffer(),
      bondingCurve.toBuffer(),
      writeString("ZRP Test"),
      writeString("ZRPT"),
      writeString("https://example.com/t.json"),
      writeU64LE(BigInt(30_000_000_000)),
      writeU64LE(BigInt(1_073_000_000_000_000)),
      writeU64LE(BigInt(1_000_000_000_000_000)),
      writeU64LE(BigInt(1_700_000_000)),
    ]);
    const logLine = await buildProgramDataLine("TokenCreatedEvent", body);

    const events = await parseTokenCreatedEvents([
      "Program log: Instruction: CreateAndBuy",
      logLine,
      "Program log: some other noise",
    ]);

    expect(events).toHaveLength(1);
    expect(events[0].mint.toBase58()).toBe(mint.toBase58());
    expect(events[0].name).toBe("ZRP Test");
    expect(events[0].symbol).toBe("ZRPT");
  });

  it("does not confuse a TradeEvent log line with a TokenCreatedEvent parse", async () => {
    const mint = Keypair.generate().publicKey;
    const trader = Keypair.generate().publicKey;
    const body = Buffer.concat([
      mint.toBuffer(),
      trader.toBuffer(),
      Buffer.from([1]), // isBuy
      writeU64LE(BigInt(1_000_000_000)),
      writeU64LE(BigInt(500_000)),
      writeU64LE(BigInt(10_000_000)),
      writeU64LE(BigInt(31_000_000_000)),
      writeU64LE(BigInt(900_000_000_000_000)),
      writeU64LE(BigInt(990_000_000)),
      writeU64LE(BigInt(900_000_000_000_000)),
      writeU64LE(BigInt(1_700_000_001)),
    ]);
    const logLine = await buildProgramDataLine("TradeEvent", body);

    const tradeEvents = await parseTradeEvents([logLine]);
    const createEvents = await parseTokenCreatedEvents([logLine]);

    expect(tradeEvents).toHaveLength(1);
    expect(tradeEvents[0].isBuy).toBe(true);
    expect(tradeEvents[0].mint.toBase58()).toBe(mint.toBase58());
    expect(createEvents).toHaveLength(0);
  });

  it("parses a GraduateEvent", async () => {
    const mint = Keypair.generate().publicKey;
    const bondingCurve = Keypair.generate().publicKey;
    const migrationAuthority = Keypair.generate().publicKey;
    const body = Buffer.concat([
      mint.toBuffer(),
      bondingCurve.toBuffer(),
      writeU64LE(BigInt(85_000_000_000)),
      writeU64LE(BigInt(50_000_000_000_000)),
      migrationAuthority.toBuffer(),
      writeU64LE(BigInt(1_700_000_002)),
    ]);
    const logLine = await buildProgramDataLine("GraduateEvent", body);

    const events = await parseGraduateEvents([logLine]);
    expect(events).toHaveLength(1);
    expect(events[0].realSolReservesMigrated).toBe(BigInt(85_000_000_000));
    expect(events[0].migrationAuthority.toBase58()).toBe(migrationAuthority.toBase58());
  });

  it("returns an empty array when no matching event is present", async () => {
    const events = await parseTokenCreatedEvents(["Program log: nothing here", "Program data: aGVsbG8="]);
    expect(events).toHaveLength(0);
  });
});
