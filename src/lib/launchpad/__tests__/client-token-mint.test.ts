import { describe, it, expect } from "vitest";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { buildBrowserMintTransaction } from "../client-token-mint";

const TOKEN_INSTRUCTION_TRANSFER_CHECKED = 12;

/*
 * Pure instruction-construction tests for the browser-signed, atomic
 * fee+mint transaction - same rationale as mint-service.ts's own
 * (removed) buildMintTransaction tests: the owner must hold mint/freeze
 * authority from the first instruction (no platform hand-off needed
 * here, unlike the old server-signed path), a revoked authority must be
 * COption::None on-chain, and the USDC fee transfer must precede the
 * mint instructions in the same transaction (what makes this atomic).
 */

const TOKEN_INSTRUCTION_SET_AUTHORITY = 6;
const AUTHORITY_TYPE_MINT_TOKENS = 0;
const AUTHORITY_TYPE_FREEZE_ACCOUNT = 1;

function decodeSetAuthority(data: Buffer): { authorityType: number; newAuthority: Buffer | null } {
  expect(data[0]).toBe(TOKEN_INSTRUCTION_SET_AUTHORITY);
  const authorityType = data[1];
  const hasNewAuthority = data[2] === 1;
  return {
    authorityType,
    newAuthority: hasNewAuthority ? data.subarray(3, 35) : null,
  };
}

function build(overrides: Partial<{ revokeMint: boolean; revokeFreeze: boolean; revokeUpdate: boolean }> = {}) {
  const owner = Keypair.generate();
  const platform = Keypair.generate();
  const mint = Keypair.generate();
  const usdcMint = Keypair.generate().publicKey;

  const tx = buildBrowserMintTransaction({
    ownerPubkey: owner.publicKey,
    platformPubkey: platform.publicKey,
    usdcMint,
    feeUsdcRawAmount: BigInt(15_000_000),
    mintPubkey: mint.publicKey,
    mintRent: 1_461_600,
    decimals: 9,
    supply: BigInt(1_000_000_000_000_000),
    name: "Test Token",
    symbol: "TEST",
    metadataUri: "https://example.com/metadata.json",
    revokeMint: overrides.revokeMint ?? false,
    revokeFreeze: overrides.revokeFreeze ?? false,
    revokeUpdate: overrides.revokeUpdate ?? false,
  });

  return { tx, owner, platform, mint, usdcMint };
}

describe("buildBrowserMintTransaction", () => {
  it("sets the owner as fee payer (the connected wallet signs once for everything)", () => {
    const { tx, owner } = build();
    expect(tx.feePayer?.equals(owner.publicKey)).toBe(true);
  });

  it("puts the USDC fee transfer before the mint account is created - same transaction, same signature", () => {
    const { tx, usdcMint, mint } = build();
    const transferIndex = tx.instructions.findIndex(
      (ix) => ix.programId.equals(TOKEN_PROGRAM_ID) && ix.data[0] === TOKEN_INSTRUCTION_TRANSFER_CHECKED && ix.keys.some((k) => k.pubkey.equals(usdcMint))
    );
    const createMintAccountIndex = tx.instructions.findIndex(
      (ix) => ix.programId.equals(SystemProgram.programId) && ix.keys.some((k) => k.pubkey.equals(mint.publicKey))
    );
    expect(transferIndex).toBeGreaterThanOrEqual(0);
    expect(createMintAccountIndex).toBeGreaterThan(transferIndex);
  });

  it("builds no revoke instructions when neither authority is revoked", () => {
    const { tx } = build({ revokeMint: false, revokeFreeze: false });
    const setAuthorityIxs = tx.instructions.filter((ix) => ix.data[0] === TOKEN_INSTRUCTION_SET_AUTHORITY);
    expect(setAuthorityIxs).toHaveLength(0);
  });

  it("sets mint authority to COption::None when revoked, without touching freeze authority", () => {
    const { tx } = build({ revokeMint: true, revokeFreeze: false });
    const setAuthorityIxs = tx.instructions.filter((ix) => ix.data[0] === TOKEN_INSTRUCTION_SET_AUTHORITY);
    expect(setAuthorityIxs).toHaveLength(1);
    const decoded = decodeSetAuthority(setAuthorityIxs[0].data);
    expect(decoded.authorityType).toBe(AUTHORITY_TYPE_MINT_TOKENS);
    expect(decoded.newAuthority).toBeNull();
  });

  it("sets freeze authority to COption::None when revoked, without touching mint authority", () => {
    const { tx } = build({ revokeMint: false, revokeFreeze: true });
    const setAuthorityIxs = tx.instructions.filter((ix) => ix.data[0] === TOKEN_INSTRUCTION_SET_AUTHORITY);
    expect(setAuthorityIxs).toHaveLength(1);
    const decoded = decodeSetAuthority(setAuthorityIxs[0].data);
    expect(decoded.authorityType).toBe(AUTHORITY_TYPE_FREEZE_ACCOUNT);
    expect(decoded.newAuthority).toBeNull();
  });

  it("revokes both independently when both are requested", () => {
    const { tx } = build({ revokeMint: true, revokeFreeze: true });
    const setAuthorityIxs = tx.instructions.filter((ix) => ix.data[0] === TOKEN_INSTRUCTION_SET_AUTHORITY);
    expect(setAuthorityIxs).toHaveLength(2);
    expect(setAuthorityIxs.every((ix) => decodeSetAuthority(ix.data).newAuthority === null)).toBe(true);
  });

  it("derives the owner's own token ATA (not the platform's) as the mint-to destination", () => {
    const { tx, owner, mint } = build();
    const ownerAta = getAssociatedTokenAddressSync(mint.publicKey, owner.publicKey);
    const mintToIx = tx.instructions.find((ix) => ix.keys.some((k) => k.pubkey.equals(ownerAta)));
    expect(mintToIx).toBeDefined();
  });
});
