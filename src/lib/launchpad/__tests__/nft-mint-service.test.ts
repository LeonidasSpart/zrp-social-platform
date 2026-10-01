import { describe, it, expect } from "vitest";
import { Keypair } from "@solana/web3.js";
import { buildMintNftTransaction } from "../mint-service";
import { METADATA_BURN_ADDRESS } from "../metaplex-metadata";

/*
 * Pure instruction-construction tests - no RPC call, no DB. What
 * actually matters here: the platform must be the signer on every
 * instruction that needs one (the owner wallet never signs anything in
 * this launchpad), and the metadata's update authority must end up at
 * its real final value (owner, or the burn address if revoked) via the
 * standalone hand-off instruction at the end - see mint-service.ts's
 * own comment for why that ordering is load-bearing, not cosmetic.
 */

function build(overrides: Partial<{ sellerFeeBasisPoints: number; revokeUpdate: boolean }> = {}) {
  const platform = Keypair.generate();
  const mint = Keypair.generate();
  const owner = Keypair.generate();

  const tx = buildMintNftTransaction({
    platformPubkey: platform.publicKey,
    mintPubkey: mint.publicKey,
    ownerPubkey: owner.publicKey,
    mintRent: 1_461_600,
    name: "Test NFT",
    symbol: "TNFT",
    metadataUri: "https://example.com/metadata.json",
    sellerFeeBasisPoints: overrides.sellerFeeBasisPoints ?? 500,
    revokeUpdate: overrides.revokeUpdate ?? false,
  });

  return { tx, platform, mint, owner };
}

describe("buildMintNftTransaction", () => {
  it("sets the platform as fee payer and builds 8 instructions in order", () => {
    const { tx, platform } = build();
    expect(tx.feePayer?.equals(platform.publicKey)).toBe(true);
    expect(tx.instructions).toHaveLength(8);
  });

  it("mints exactly 1 raw unit to the owner's ATA (a true 1-of-1, not a configurable supply)", () => {
    const { tx } = build();
    // createMintToInstruction is instruction index 4 (compute budget,
    // createAccount, initializeMint, createATA, mintTo, ...).
    const mintToIx = tx.instructions[4];
    // SPL Token MintTo instruction: [discriminator(7), amount as u64 LE].
    expect(mintToIx.data[0]).toBe(7);
    const amount = mintToIx.data.readBigUInt64LE(1);
    expect(amount).toBe(BigInt(1));
  });

  it("requires the platform as signer on both the metadata-create and master-edition-create instructions", () => {
    const { tx, platform } = build();
    const createMetadataIx = tx.instructions[5];
    const createMasterEditionIx = tx.instructions[6];

    for (const ix of [createMetadataIx, createMasterEditionIx]) {
      const platformKey = ix.keys.find((k) => k.pubkey.equals(platform.publicKey));
      expect(platformKey?.isSigner).toBe(true);
    }
  });

  it("hands metadata update authority to the owner's wallet when not revoked", () => {
    const { tx, owner, platform } = build({ revokeUpdate: false });
    const updateAuthorityIx = tx.instructions[7];

    // The CURRENT authority (still the platform, the only signer) is an
    // account key; the NEW authority is embedded in the instruction's
    // serialized data payload.
    const currentAuthorityKey = updateAuthorityIx.keys.find((k) => k.pubkey.equals(platform.publicKey));
    expect(currentAuthorityKey?.isSigner).toBe(true);
    expect(updateAuthorityIx.data.includes(owner.publicKey.toBuffer())).toBe(true);
    expect(updateAuthorityIx.data.includes(METADATA_BURN_ADDRESS.toBuffer())).toBe(false);
  });

  it("hands metadata update authority to the burn address when revoked", () => {
    const { tx, owner } = build({ revokeUpdate: true });
    const updateAuthorityIx = tx.instructions[7];

    expect(updateAuthorityIx.data.includes(METADATA_BURN_ADDRESS.toBuffer())).toBe(true);
    expect(updateAuthorityIx.data.includes(owner.publicKey.toBuffer())).toBe(false);
  });
});
