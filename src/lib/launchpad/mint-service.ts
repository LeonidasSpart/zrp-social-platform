import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { prisma } from "@/lib/db";
import { getConnection, getPlatformWallet } from "@/lib/solana";
import {
  buildCreateNftMetadataInstruction,
  buildCreateMasterEditionInstruction,
  buildUpdateNftAuthorityInstruction,
  METADATA_BURN_ADDRESS,
} from "./metaplex-metadata";

// ============================================================
// Phase 6a: NFT minting
// ============================================================
//
// Fungible-token creation used to be server-signed here too, but is now
// a browser-signed, atomic fee+mint transaction instead (see
// src/lib/launchpad/client-token-mint.ts and the create-token route's
// own comment) - zrppad's own one-click, same-transaction UX. NFT
// creation still uses this server-signed path below; it has not been
// ported to the same atomic model yet.

export interface MintLaunchedNftParams {
  launchedNftId: string;
  ownerWalletAddress: string;
  mintKeypair: Keypair;
  name: string;
  symbol: string;
  metadataUri: string;
  sellerFeeBasisPoints: number;
  revokeUpdate: boolean;
}

async function recordNftBroadcast(launchedNftId: string, signature: string, mintAddress: string, attempts = 3): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await prisma.launchedNft.update({
        where: { id: launchedNftId },
        data: { mintTransactionId: signature, mintAddress },
      });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
      }
    }
  }
  console.error(
    `CRITICAL: launched NFT ${launchedNftId} broadcast on-chain (signature ${signature}, mint ${mintAddress}) but failed to persist after ${attempts} attempts.`,
    lastError
  );
}

async function markNftStatus(launchedNftId: string, status: "COMPLETED" | "FAILED", failureReason?: string): Promise<void> {
  await prisma.launchedNft.update({
    where: { id: launchedNftId },
    data: { status, failureReason: failureReason ?? null },
  });
}

// Exported for unit testing, same rationale as buildMintTransaction above.
// Always supply=1/decimals=0 (a 1-of-1 NFT) - unlike buildMintTransaction
// there is no revokeMint/revokeFreeze choice, since
// buildCreateMasterEditionInstruction consumes/transfers both
// authorities to the edition PDA itself as a side effect; the only
// authority choice an NFT creator makes is revokeUpdate (freeze the
// metadata permanently).
export function buildMintNftTransaction(params: {
  platformPubkey: PublicKey;
  mintPubkey: PublicKey;
  ownerPubkey: PublicKey;
  mintRent: number;
  name: string;
  symbol: string;
  metadataUri: string;
  sellerFeeBasisPoints: number;
  revokeUpdate: boolean;
}): Transaction {
  const { platformPubkey, mintPubkey, ownerPubkey, mintRent, name, symbol, metadataUri, sellerFeeBasisPoints, revokeUpdate } = params;

  const transaction = new Transaction();
  transaction.feePayer = platformPubkey;

  transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));

  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: platformPubkey,
      newAccountPubkey: mintPubkey,
      space: MINT_SIZE,
      lamports: mintRent,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(mintPubkey, 0, platformPubkey, platformPubkey, TOKEN_PROGRAM_ID)
  );

  const ownerAta = getAssociatedTokenAddressSync(
    mintPubkey,
    ownerPubkey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  transaction.add(
    createAssociatedTokenAccountInstruction(
      platformPubkey,
      ownerAta,
      ownerPubkey,
      mintPubkey,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );

  transaction.add(createMintToInstruction(mintPubkey, ownerAta, platformPubkey, BigInt(1), [], TOKEN_PROGRAM_ID));

  // Metadata is created with the PLATFORM as update authority - it has
  // to be, since createCreateMasterEditionV3 below requires the
  // metadata's CURRENT update authority to sign, and the owner wallet
  // never signs anything in this launchpad. Handed off to its real
  // final value (the owner, or the burn address if revoked) by the
  // standalone update-authority instruction at the very end, once
  // nothing platform-signed still needs it.
  transaction.add(
    buildCreateNftMetadataInstruction({
      mint: mintPubkey,
      mintAuthority: platformPubkey,
      payer: platformPubkey,
      updateAuthority: platformPubkey,
      creatorAddress: ownerPubkey,
      name,
      symbol,
      metadataUri,
      sellerFeeBasisPoints,
      isMutable: !revokeUpdate,
    })
  );

  // Consumes/transfers the mint's own mint+freeze authority to the
  // edition PDA as a side effect - no separate createSetAuthorityInstruction
  // calls needed here, unlike the fungible-token mint path.
  transaction.add(
    buildCreateMasterEditionInstruction({
      mint: mintPubkey,
      updateAuthority: platformPubkey,
      mintAuthority: platformPubkey,
      payer: platformPubkey,
    })
  );

  transaction.add(
    buildUpdateNftAuthorityInstruction({
      mint: mintPubkey,
      currentAuthority: platformPubkey,
      newAuthority: revokeUpdate ? METADATA_BURN_ADDRESS : ownerPubkey,
    })
  );

  return transaction;
}

/**
 * Builds, signs, broadcasts and confirms the mint transaction for an
 * already-created LaunchedNft row (status PENDING, fee already verified
 * and claimed by the caller). Same never-throws-for-on-chain-failure
 * contract as mintLaunchedToken().
 */
export async function mintLaunchedNft(params: MintLaunchedNftParams): Promise<void> {
  const { launchedNftId, ownerWalletAddress, mintKeypair, name, symbol, metadataUri, sellerFeeBasisPoints, revokeUpdate } = params;

  const ownerPubkey = new PublicKey(ownerWalletAddress);

  const connection = getConnection();
  const platform = getPlatformWallet();

  let mintRent: number;
  try {
    mintRent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
  } catch (error) {
    await markNftStatus(launchedNftId, "FAILED", "Failed to query Solana for rent-exemption amounts.");
    console.error(`Launchpad NFT mint ${launchedNftId}: rent query failed:`, error);
    return;
  }

  const transaction = buildMintNftTransaction({
    platformPubkey: platform.publicKey,
    mintPubkey: mintKeypair.publicKey,
    ownerPubkey,
    mintRent,
    name,
    symbol,
    metadataUri,
    sellerFeeBasisPoints,
    revokeUpdate,
  });

  let signature: string;
  try {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("finalized");
    transaction.recentBlockhash = blockhash;
    transaction.sign(platform, mintKeypair);

    signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
      preflightCommitment: "confirmed",
    });

    await recordNftBroadcast(launchedNftId, signature, mintKeypair.publicKey.toBase58());

    const confirmation = await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed"
    );

    if (confirmation.value.err) {
      await markNftStatus(launchedNftId, "FAILED", `Transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
      return;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error while minting.";
    console.error(`Launchpad NFT mint ${launchedNftId}: mint transaction error:`, error);
    await markNftStatus(launchedNftId, "FAILED", message);
    return;
  }

  await markNftStatus(launchedNftId, "COMPLETED");
}
