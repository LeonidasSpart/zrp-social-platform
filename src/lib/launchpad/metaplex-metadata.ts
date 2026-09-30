import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  createCreateMetadataAccountV3Instruction,
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
