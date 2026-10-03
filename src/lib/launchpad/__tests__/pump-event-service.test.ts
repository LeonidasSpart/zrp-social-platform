import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { OFFLINE_PUMP_PROGRAM, PUMP_PROGRAM_ID } from "../pump-curve-keys";
import { parseCreateEvent, parseTradeEvent, parseCompleteEvent, parseMigrationEvent } from "../pump-event-service";

/*
 * Builds a realistic confirmed-transaction log array for a single pump
 * instruction that emits exactly one event, matching the real shape
 * Anchor's `emit_cpi!` produces (see EventParser's own handleLog: it only
 * recognizes "Program data:" lines while a "Program <id> invoke" / "...
 * success" pair frames the current program context). This is the same
 * log shape `connection.getTransaction(...).meta.logMessages` returns for
 * a real confirmed transaction - EventParser makes no distinction between
 * a live log array and this one.
 */
function logsWithEvent(eventTypeName: string, data: Record<string, unknown>): string[] {
  const encoded = OFFLINE_PUMP_PROGRAM.coder.types.encode(eventTypeName, data);
  // The Program's loaded IDL already camelCases event names (e.g.
  // "createEvent", not "CreateEvent") - matches the coder's own type/event
  // name convention used throughout this file.
  const idl = OFFLINE_PUMP_PROGRAM.idl as unknown as { events: Array<{ name: string; discriminator: number[] }> };
  const match = idl.events.find((e) => e.name === eventTypeName);
  if (!match) throw new Error(`No event named "${eventTypeName}" in the pump IDL.`);
  const discriminator = Buffer.from(match.discriminator);
  const payload = Buffer.concat([discriminator, encoded]).toString("base64");
  return [
    `Program ${PUMP_PROGRAM_ID.toBase58()} invoke [1]`,
    "Program log: Instruction: Noop",
    `Program data: ${payload}`,
    `Program ${PUMP_PROGRAM_ID.toBase58()} success`,
  ];
}

describe("pump-event-service", () => {
  const mint = Keypair.generate().publicKey;
  const otherMint = Keypair.generate().publicKey;
  const bondingCurve = Keypair.generate().publicKey;
  const user = Keypair.generate().publicKey;
  const creator = Keypair.generate().publicKey;
  const pool = Keypair.generate().publicKey;

  describe("parseCreateEvent", () => {
    const createEventData = {
      name: "Test Token",
      symbol: "TEST",
      uri: "https://example.com/metadata.json",
      mint,
      bondingCurve,
      user,
      creator,
      timestamp: new BN(1_700_000_000),
      virtualTokenReserves: new BN("1000000000000"),
      virtualSolReserves: new BN("30000000000"),
      realTokenReserves: new BN("793100000000"),
      tokenTotalSupply: new BN("1000000000000"),
      tokenProgram: PublicKey.default,
      isMayhemMode: false,
      isCashbackEnabled: false,
      quoteMint: PublicKey.default,
      virtualQuoteReserves: new BN("30000000000"),
      creatorFeeBps: new BN(0),
      isHolderReward: false,
    };

    it("decodes the real on-chain CreateEvent for the claimed mint", () => {
      const logs = logsWithEvent("createEvent", createEventData);
      const event = parseCreateEvent(logs, mint);
      expect(event).not.toBeNull();
      expect(event!.name).toBe("Test Token");
      expect(event!.symbol).toBe("TEST");
      expect(event!.uri).toBe("https://example.com/metadata.json");
      expect(event!.mint.equals(mint)).toBe(true);
      expect(event!.creator.equals(creator)).toBe(true);
      expect(event!.virtualTokenReserves.toString()).toBe("1000000000000");
    });

    it("returns null when the logs' CreateEvent is for a different mint", () => {
      const logs = logsWithEvent("createEvent", createEventData);
      expect(parseCreateEvent(logs, otherMint)).toBeNull();
    });

    it("returns null when the logs contain no CreateEvent at all", () => {
      expect(parseCreateEvent(["Program log: nothing here"], mint)).toBeNull();
    });
  });

  describe("parseTradeEvent", () => {
    const tradeEventData = {
      mint,
      solAmount: new BN("1000000000"),
      tokenAmount: new BN("500000000"),
      isBuy: true,
      user,
      timestamp: new BN(1_700_000_100),
      virtualSolReserves: new BN("31000000000"),
      virtualTokenReserves: new BN("999500000000"),
      realSolReserves: new BN("1000000000"),
      realTokenReserves: new BN("792600000000"),
      feeRecipient: PublicKey.default,
      feeBasisPoints: new BN(100),
      fee: new BN("10000000"),
      creator,
      creatorFeeBasisPoints: new BN(0),
      creatorFee: new BN(0),
      trackVolume: false,
      totalUnclaimedTokens: new BN(0),
      totalClaimedTokens: new BN(0),
      currentSolVolume: new BN(0),
      lastUpdateTimestamp: new BN(0),
      ixName: "buy",
      mayhemMode: false,
      cashbackFeeBasisPoints: new BN(0),
      cashback: new BN(0),
      buybackFeeBasisPoints: new BN(0),
      buybackFee: new BN(0),
      shareholders: [],
      quoteMint: PublicKey.default,
      quoteAmount: new BN("1000000000"),
      virtualQuoteReserves: new BN("31000000000"),
      realQuoteReserves: new BN("1000000000"),
      holderRewardsBps: new BN(0),
      holderRewards: new BN(0),
    };

    it("decodes the real on-chain TradeEvent for the claimed mint", () => {
      const logs = logsWithEvent("tradeEvent", tradeEventData);
      const event = parseTradeEvent(logs, mint);
      expect(event).not.toBeNull();
      expect(event!.isBuy).toBe(true);
      expect(event!.solAmount.toString()).toBe("1000000000");
      expect(event!.tokenAmount.toString()).toBe("500000000");
    });

    it("returns null for a different mint", () => {
      const logs = logsWithEvent("tradeEvent", tradeEventData);
      expect(parseTradeEvent(logs, otherMint)).toBeNull();
    });
  });

  describe("parseCompleteEvent", () => {
    const completeEventData = {
      user,
      mint,
      bondingCurve,
      timestamp: new BN(1_700_000_200),
      quoteMint: PublicKey.default,
    };

    it("decodes the real on-chain CompleteEvent for the claimed mint", () => {
      const logs = logsWithEvent("completeEvent", completeEventData);
      const event = parseCompleteEvent(logs, mint);
      expect(event).not.toBeNull();
      expect(event!.bondingCurve.equals(bondingCurve)).toBe(true);
    });

    it("returns null for a different mint", () => {
      const logs = logsWithEvent("completeEvent", completeEventData);
      expect(parseCompleteEvent(logs, otherMint)).toBeNull();
    });
  });

  describe("parseMigrationEvent", () => {
    const migrationEventData = {
      user,
      mint,
      mintAmount: new BN("793100000000"),
      solAmount: new BN("85000000000"),
      poolMigrationFee: new BN("500000000"),
      bondingCurve,
      timestamp: new BN(1_700_000_300),
      pool,
      quoteMint: PublicKey.default,
    };

    it("decodes the real on-chain CompletePumpAmmMigrationEvent for the claimed mint", () => {
      const logs = logsWithEvent("completePumpAmmMigrationEvent", migrationEventData);
      const event = parseMigrationEvent(logs, mint);
      expect(event).not.toBeNull();
      expect(event!.pool.equals(pool)).toBe(true);
      expect(event!.mintAmount.toString()).toBe("793100000000");
      expect(event!.solAmount.toString()).toBe("85000000000");
      expect(event!.poolMigrationFee.toString()).toBe("500000000");
    });

    it("returns null for a different mint - never attributes another token's migration to this one", () => {
      const logs = logsWithEvent("completePumpAmmMigrationEvent", migrationEventData);
      expect(parseMigrationEvent(logs, otherMint)).toBeNull();
    });

    it("returns null when the transaction's logs contain no migration event (e.g. a plain buy/sell)", () => {
      const tradeLogs = logsWithEvent("tradeEvent", {
        mint,
        solAmount: new BN(1),
        tokenAmount: new BN(1),
        isBuy: true,
        user,
        timestamp: new BN(0),
        virtualSolReserves: new BN(0),
        virtualTokenReserves: new BN(0),
        realSolReserves: new BN(0),
        realTokenReserves: new BN(0),
        feeRecipient: PublicKey.default,
        feeBasisPoints: new BN(0),
        fee: new BN(0),
        creator,
        creatorFeeBasisPoints: new BN(0),
        creatorFee: new BN(0),
        trackVolume: false,
        totalUnclaimedTokens: new BN(0),
        totalClaimedTokens: new BN(0),
        currentSolVolume: new BN(0),
        lastUpdateTimestamp: new BN(0),
        ixName: "buy",
        mayhemMode: false,
        cashbackFeeBasisPoints: new BN(0),
        cashback: new BN(0),
        buybackFeeBasisPoints: new BN(0),
        buybackFee: new BN(0),
        shareholders: [],
        quoteMint: PublicKey.default,
        quoteAmount: new BN(1),
        virtualQuoteReserves: new BN(0),
        realQuoteReserves: new BN(0),
        holderRewardsBps: new BN(0),
        holderRewards: new BN(0),
      });
      expect(parseMigrationEvent(tradeLogs, mint)).toBeNull();
    });
  });
});
