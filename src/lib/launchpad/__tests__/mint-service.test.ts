import { describe, it, expect } from "vitest";
import { Keypair } from "@solana/web3.js";
import { buildMintTransaction } from "../mint-service";

/*
 * Pure instruction-construction tests - no RPC call, no DB. The thing
 * that actually matters here is the same thing mintLaunchedToken()'s own
 * comment calls out: mint/freeze authority must never be left with the
 * platform, and a revoked authority must be set to COption::None on-chain
 * (not merely "not set to the user"), both of which are cheap to get
 * subtly wrong when hand-assembling SPL Token instructions.
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
  const platform = Keypair.generate();
  const mint = Keypair.generate();
  const owner = Keypair.generate();

  const tx = buildMintTransaction({
    platformPubkey: platform.publicKey,
    mintPubkey: mint.publicKey,
    ownerPubkey: owner.publicKey,
    mintRent: 1_461_600,
    decimals: 9,
    supply: BigInt("1000000000000000"),
    name: "Test Token",
    symbol: "TEST",
    metadataUri: "https://example.com/metadata.json",
    revokeMint: overrides.revokeMint ?? false,
    revokeFreeze: overrides.revokeFreeze ?? false,
    revokeUpdate: overrides.revokeUpdate ?? false,
  });

  return { tx, platform, mint, owner };
}

describe("buildMintTransaction", () => {
  it("sets the platform as fee payer and builds 8 instructions in order", () => {
    const { tx, platform } = build();
    expect(tx.feePayer?.equals(platform.publicKey)).toBe(true);
    expect(tx.instructions).toHaveLength(8);
    // Last two instructions must be the SetAuthority hand-off/revocation -
    // every earlier instruction still needs the platform to hold mint/
    // freeze authority, so this order is load-bearing, not cosmetic.
    const [mintAuthIx, freezeAuthIx] = tx.instructions.slice(-2);
    expect(decodeSetAuthority(mintAuthIx.data).authorityType).toBe(AUTHORITY_TYPE_MINT_TOKENS);
    expect(decodeSetAuthority(freezeAuthIx.data).authorityType).toBe(AUTHORITY_TYPE_FREEZE_ACCOUNT);
  });

  it("hands mint + freeze authority to the owner's wallet when not revoked", () => {
    const { tx, owner } = build({ revokeMint: false, revokeFreeze: false });
    const [mintAuthIx, freezeAuthIx] = tx.instructions.slice(-2);

    const mintAuth = decodeSetAuthority(mintAuthIx.data);
    const freezeAuth = decodeSetAuthority(freezeAuthIx.data);

    expect(mintAuth.newAuthority).not.toBeNull();
    expect(mintAuth.newAuthority).toEqual(owner.publicKey.toBuffer());
    expect(freezeAuth.newAuthority).not.toBeNull();
    expect(freezeAuth.newAuthority).toEqual(owner.publicKey.toBuffer());
  });

  it("sets authority to COption::None (not merely 'not the owner') when revoked", () => {
    const { tx } = build({ revokeMint: true, revokeFreeze: true });
    const [mintAuthIx, freezeAuthIx] = tx.instructions.slice(-2);

    expect(decodeSetAuthority(mintAuthIx.data).newAuthority).toBeNull();
    expect(decodeSetAuthority(freezeAuthIx.data).newAuthority).toBeNull();
  });

  it("supports revoking only one of mint/freeze authority independently", () => {
    const { tx, owner } = build({ revokeMint: true, revokeFreeze: false });
    const [mintAuthIx, freezeAuthIx] = tx.instructions.slice(-2);

    expect(decodeSetAuthority(mintAuthIx.data).newAuthority).toBeNull();
    expect(decodeSetAuthority(freezeAuthIx.data).newAuthority).toEqual(owner.publicKey.toBuffer());
  });
});
