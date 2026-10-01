import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  createCreateMetadataAccountV3Instruction,
  createCreateMasterEditionV3Instruction,
  createUpdateMetadataAccountV2Instruction,
  PROGRAM_ID as METADATA_PROGRAM_ID,
} from "@metaplex-foundation/mpl-token-metadata";

/**
 * The Metaplex Token Metadata "burn" address - the community-standard
 * sentinel used to mark an update authority as permanently revoked (a
 * plain `null` is not a valid updateAuthority for this instruction).
 * Same address zrppad's create-token.ts uses.
 */
export const METADATA_BURN_ADDRESS = new PublicKey(
  "1nc1nerator11111111111111111111111111111111"
);

export function deriveMetadataPda(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM_ID
  );
}

export function deriveMasterEditionPda(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer(), Buffer.from("edition")],
    METADATA_PROGRAM_ID
  );
}

/**
 * Builds the createCreateMetadataAccountV3 instruction for a freshly
 * created mint. mintAuthority must be the platform wallet (the temporary
 * authority mint-service.ts sets at initializeMint time) since this
 * instruction requires the mint authority's signature; updateAuthority is
 * set directly to its final value (the creator's verified wallet, or the
 * burn address if revoked) so no separate update-metadata instruction is
 * ever needed afterwards.
 */
export function buildCreateMetadataInstruction(params: {
  mint: PublicKey;
  mintAuthority: PublicKey;
  payer: PublicKey;
  updateAuthority: PublicKey;
  name: string;
  symbol: string;
  metadataUri: string;
  isMutable: boolean;
}): TransactionInstruction {
  const [metadataPda] = deriveMetadataPda(params.mint);

  return createCreateMetadataAccountV3Instruction(
    {
      metadata: metadataPda,
      mint: params.mint,
      mintAuthority: params.mintAuthority,
      payer: params.payer,
      updateAuthority: params.updateAuthority,
    },
    {
      createMetadataAccountArgsV3: {
        data: {
          name: params.name,
          symbol: params.symbol,
          uri: params.metadataUri,
          sellerFeeBasisPoints: 0,
          creators: null,
          collection: null,
          uses: null,
        },
        isMutable: params.isMutable,
        collectionDetails: null,
      },
    }
  );
}

/**
 * Same as buildCreateMetadataInstruction, but with the royalty
 * (sellerFeeBasisPoints) and a single verified creator entry an NFT
 * needs and a fungible token never does - kept as a separate function
 * rather than extending the token one so that path's `sellerFeeBasisPoints:
 * 0, creators: null` stays untouched for every existing caller.
 */
export function buildCreateNftMetadataInstruction(params: {
  mint: PublicKey;
  mintAuthority: PublicKey;
  payer: PublicKey;
  updateAuthority: PublicKey;
  creatorAddress: PublicKey;
  name: string;
  symbol: string;
  metadataUri: string;
  sellerFeeBasisPoints: number;
  isMutable: boolean;
}): TransactionInstruction {
  const [metadataPda] = deriveMetadataPda(params.mint);

  return createCreateMetadataAccountV3Instruction(
    {
      metadata: metadataPda,
      mint: params.mint,
      mintAuthority: params.mintAuthority,
      payer: params.payer,
      updateAuthority: params.updateAuthority,
    },
    {
      createMetadataAccountArgsV3: {
        data: {
          name: params.name,
          symbol: params.symbol,
          uri: params.metadataUri,
          sellerFeeBasisPoints: params.sellerFeeBasisPoints,
          creators: [{ address: params.creatorAddress, verified: false, share: 100 }],
          collection: null,
          uses: null,
        },
        isMutable: params.isMutable,
        collectionDetails: null,
      },
    }
  );
}

/**
 * Builds the createCreateMasterEditionV3 instruction - the account that
 * actually marks a mint as a true Metaplex non-fungible to every wallet
 * and marketplace. Without it, a supply=1/decimals=0 mint is just a
 * token that happens to have one unit, indistinguishable from any other
 * SPL token to indexers that look for this account. maxSupply: 0 means
 * no further "print editions" can ever be minted from this one - the
 * correct value for a plain 1-of-1 NFT (this launchpad doesn't offer
 * open/limited-edition print runs). Requires the CURRENT mint
 * authority's signature (still the platform at this point in the
 * transaction) - the instruction itself transfers both mint and freeze
 * authority to this edition PDA as a side effect, which is why
 * mint-service.ts's mintLaunchedNft() never needs its own separate
 * createSetAuthorityInstruction calls the way token minting does.
 */
export function buildCreateMasterEditionInstruction(params: {
  mint: PublicKey;
  updateAuthority: PublicKey;
  mintAuthority: PublicKey;
  payer: PublicKey;
}): TransactionInstruction {
  const [metadataPda] = deriveMetadataPda(params.mint);
  const [editionPda] = deriveMasterEditionPda(params.mint);

  return createCreateMasterEditionV3Instruction(
    {
      edition: editionPda,
      mint: params.mint,
      updateAuthority: params.updateAuthority,
      mintAuthority: params.mintAuthority,
      payer: params.payer,
      metadata: metadataPda,
    },
    {
      createMasterEditionArgs: {
        maxSupply: 0,
      },
    }
  );
}

/**
 * Transfers metadata update authority to its FINAL value, as the last
 * instruction in the mint transaction. The metadata account has to be
 * created with the platform as its update authority (createCreateMasterEditionV3
 * requires the CURRENT update authority's signature, and the owner
 * wallet never signs anything in this launchpad), so this one extra
 * instruction is what hands it off afterwards - exactly what
 * createSetAuthorityInstruction does for the mint/freeze authorities on
 * the fungible-token path, just via Metaplex's own update instruction
 * since mint/freeze authority and metadata update authority are
 * unrelated concepts. `currentAuthority` must still be the platform
 * (the only signer); passing null for every other arg leaves the rest
 * of the metadata account (name/symbol/uri/creators/isMutable)
 * untouched.
 */
export function buildUpdateNftAuthorityInstruction(params: {
  mint: PublicKey;
  currentAuthority: PublicKey;
  newAuthority: PublicKey;
}): TransactionInstruction {
  const [metadataPda] = deriveMetadataPda(params.mint);

  return createUpdateMetadataAccountV2Instruction(
    {
      metadata: metadataPda,
      updateAuthority: params.currentAuthority,
    },
    {
      updateMetadataAccountArgsV2: {
        data: null,
        updateAuthority: params.newAuthority,
        primarySaleHappened: null,
        isMutable: null,
      },
    }
  );
}
