import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { getPumpProgram, PUMP_PROGRAM_ID, type Global } from "@pump-fun/pump-sdk";
import { buildCreateInstructions } from "../client-pump-create";

function keypair(seed: number): PublicKey {
  return Keypair.fromSeed(new Uint8Array(32).fill(seed)).publicKey;
}

const OFFLINE_PROGRAM = getPumpProgram(null as any);

// A minimal-but-complete Global object - only the fields create_v2 /
// create_v2_and_buy's builders and the buy-quote math actually read.
function fakeGlobal(overrides: Partial<Global> = {}): Global {
  return {
    initialized: true,
    authority: PublicKey.default,
    feeRecipient: PublicKey.default,
    initialVirtualTokenReserves: new BN("1073000000000000"),
    initialVirtualSolReserves: new BN("30000000000"),
    initialRealTokenReserves: new BN("793100000000000"),
    tokenTotalSupply: new BN("1000000000000000"),
    feeBasisPoints: new BN(100),
    withdrawAuthority: PublicKey.default,
    enableMigrate: true,
    poolMigrationFee: new BN(0),
    creatorFeeBasisPoints: new BN(0),
    feeRecipients: Array(7).fill(PublicKey.default),
    setCreatorAuthority: PublicKey.default,
    adminSetCreatorAuthority: PublicKey.default,
    createV2Enabled: true,
    whitelistPda: PublicKey.default,
    reservedFeeRecipient: PublicKey.default,
    mayhemModeEnabled: false,
    reservedFeeRecipients: Array(7).fill(PublicKey.default),
    isCashbackEnabled: false,
    buybackFeeRecipients: Array(8).fill(PublicKey.default),
    buybackBasisPoints: new BN(0),
    initialVirtualQuoteReserves: new BN("30000000000"),
    whitelistedQuoteMints: Array(1).fill(PublicKey.default),
    creatorFeeConfigurable: false,
    maxConfigurableCreatorFeeBps: new BN(0),
    holderRewardClaimAuthority: PublicKey.default,
    isHolderRewardEnabled: false,
    ...overrides,
  } as unknown as Global;
}

describe("buildCreateInstructions", () => {
  const mint = keypair(1);
  const creator = keypair(2);
  const user = creator;

  it("builds a single create_v2 instruction (no buy) targeting the pump program with the new mint", async () => {
    const instructions = await buildCreateInstructions(fakeGlobal(), {
      mint,
      name: "Test Token",
      symbol: "TEST",
      uri: "https://example.com/metadata.json",
      creator,
      user,
    });

    expect(instructions).toHaveLength(1);
    expect(instructions[0].programId.equals(PUMP_PROGRAM_ID)).toBe(true);
    const mintKey = instructions[0].keys.find((k) => k.pubkey.equals(mint));
    expect(mintKey, "mint must be among the instruction's accounts").toBeDefined();
    // The new mint account must sign its own creation - a wrong/missing
    // signer flag here would mean the transaction silently can't create
    // the account that a wallet-only signature can't authorize.
    expect(mintKey!.isSigner).toBe(true);
    expect(mintKey!.isWritable).toBe(true);
  });

  it("builds create_v2 + ATA-create + buy instructions when an initial buy is requested", async () => {
    const instructions = await buildCreateInstructions(fakeGlobal(), {
      mint,
      name: "Test Token",
      symbol: "TEST",
      uri: "https://example.com/metadata.json",
      creator,
      user,
      initialBuySolLamports: BigInt(1_000_000_000),
      quotedTokenAmountRaw: BigInt(500_000_000_000),
    });

    expect(instructions.length).toBeGreaterThanOrEqual(3);
    const mintSigningInstruction = instructions.find((ix) =>
      ix.keys.some((k) => k.pubkey.equals(mint) && k.isSigner)
    );
    expect(mintSigningInstruction, "the create instruction (mint as signer) must still be present").toBeDefined();
    const pumpInstructions = instructions.filter((ix) => ix.programId.equals(PUMP_PROGRAM_ID));
    // Both create_v2 and the buy are pump-program instructions.
    expect(pumpInstructions.length).toBeGreaterThanOrEqual(2);
  });

  it("throws rather than silently skipping the buy when an initial buy amount is given without a quoted token amount", async () => {
    await expect(
      buildCreateInstructions(fakeGlobal(), {
        mint,
        name: "Test Token",
        symbol: "TEST",
        uri: "https://example.com/metadata.json",
        creator,
        user,
        initialBuySolLamports: BigInt(1_000_000_000),
      })
    ).rejects.toThrow(/quoted token amount/);
  });

  it("is deterministic: the same inputs produce the same instruction account lists", async () => {
    const paramsA = { mint, name: "Test Token", symbol: "TEST", uri: "https://example.com/metadata.json", creator, user };
    const a = await buildCreateInstructions(fakeGlobal(), paramsA);
    const b = await buildCreateInstructions(fakeGlobal(), paramsA);
    expect(a[0].keys.map((k) => k.pubkey.toBase58())).toEqual(b[0].keys.map((k) => k.pubkey.toBase58()));
  });
});

// Sanity check that the offline program used throughout this mission's
// other pump test files is also usable for this one - no separate decode
// path to drift from pump-curve-service.test.ts's own fixtures.
describe("OFFLINE_PROGRAM sanity", () => {
  it("resolves to the real pump program id", () => {
    expect(OFFLINE_PROGRAM.programId.equals(PUMP_PROGRAM_ID)).toBe(true);
  });
});
