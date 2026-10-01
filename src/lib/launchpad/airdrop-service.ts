import { PublicKey, Transaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { getConnection } from "@/lib/solana";

/*
 * ZRP Launchpad: airdrop - a creator distributing their own already-held
 * token supply to a list of wallets. Non-custodial by construction: the
 * creator's own connected wallet is both fee payer and the only signer
 * (see client-airdrop.ts), sending straight from their own ATA. ZRP never
 * holds the tokens being distributed.
 *
 * zrppad's own reference implementation (src/app/airdrop/page.tsx) had a
 * real bug worth not repeating: it transferred straight into
 * getAssociatedTokenAddress(mint, recipient) without ever creating that
 * account first, which fails on-chain for any recipient who doesn't
 * already hold the token. Every transfer instruction here is preceded by
 * an idempotent create-ATA instruction, paid for by the sender (the same
 * pattern client-token-mint.ts already uses for its own ATA).
 */

export interface AirdropRecipientInput {
  walletAddress: string;
}

/**
 * Pure instruction construction for one batch - no RPC call, no wallet.
 * Exported for unit testing, same rationale as buildBrowserMintTransaction:
 * the thing that actually matters (idempotent ATA creation preceding
 * every transfer, exact raw amount, sender as fee payer) is cheap to get
 * subtly wrong by hand.
 */
export function buildAirdropBatchTransaction(params: {
  senderPubkey: PublicKey;
  mintPubkey: PublicKey;
  recipients: AirdropRecipientInput[];
  amountPerRecipientRaw: bigint;
  decimals: number;
}): Transaction {
  const { senderPubkey, mintPubkey, recipients, amountPerRecipientRaw, decimals } = params;

  const transaction = new Transaction();
  transaction.feePayer = senderPubkey;

  const senderAta = getAssociatedTokenAddressSync(mintPubkey, senderPubkey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

  for (const recipient of recipients) {
    const recipientPubkey = new PublicKey(recipient.walletAddress);
    const recipientAta = getAssociatedTokenAddressSync(mintPubkey, recipientPubkey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

    transaction.add(
      createAssociatedTokenAccountIdempotentInstruction(senderPubkey, recipientAta, recipientPubkey, mintPubkey, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)
    );
    transaction.add(
      createTransferCheckedInstruction(senderAta, mintPubkey, recipientAta, senderPubkey, amountPerRecipientRaw, decimals, [], TOKEN_PROGRAM_ID)
    );
  }

  return transaction;
}

export interface VerifiedAirdropRecipient {
  walletAddress: string;
  rawAmount: bigint;
}

export interface AirdropBatchVerification {
  valid: true;
  verifiedRecipients: VerifiedAirdropRecipient[];
}

/**
 * Independently re-derives what a claimed airdrop batch transaction
 * actually did on-chain, from its own pre/post token-balance metadata -
 * the same technique src/lib/launchpad/spl-transfer-verify.ts already
 * uses for payment-in verification, generalized from "credited the
 * platform's own ATA" to "credited each of these arbitrary wallets by
 * exactly amountPerRecipientRaw." A client-claimed recipient that the
 * chain doesn't actually show as credited is silently excluded from
 * verifiedRecipients rather than trusted - the caller decides what to do
 * with the gap (record it as FAILED).
 */
export async function verifyAirdropBatchTransaction(params: {
  transactionId: string;
  mintAddress: string;
  senderWalletAddress: string;
  amountPerRecipientRaw: bigint;
  claimedRecipientWallets: string[];
}): Promise<AirdropBatchVerification> {
  const { transactionId, mintAddress, senderWalletAddress, amountPerRecipientRaw, claimedRecipientWallets } = params;

  if (!transactionId) {
    throw new Error("Transaction signature is required.");
  }

  const mint = new PublicKey(mintAddress);
  const connection = getConnection();

  const tx = await connection.getTransaction(transactionId, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });

  if (!tx) {
    throw new Error("Transaction not found.");
  }
  if (tx.meta?.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(tx.meta.err)}`);
  }

  const preBalances = tx.meta?.preTokenBalances ?? [];
  const postBalances = tx.meta?.postTokenBalances ?? [];
  const mintStr = mint.toBase58();

  const deltaByOwner = new Map<string, bigint>();
  for (const post of postBalances) {
    if (post.mint !== mintStr) continue;
    const owner = (post as { owner?: string }).owner;
    if (!owner) continue;
    const pre = preBalances.find((b) => b.accountIndex === post.accountIndex && b.mint === mintStr);
    const preAmt = BigInt(pre?.uiTokenAmount.amount || "0");
    const postAmt = BigInt(post.uiTokenAmount.amount || "0");
    deltaByOwner.set(owner, (deltaByOwner.get(owner) ?? BigInt(0)) + (postAmt - preAmt));
  }

  const senderDelta = deltaByOwner.get(senderWalletAddress) ?? BigInt(0);
  if (senderDelta >= BigInt(0)) {
    throw new Error("This transaction did not debit the claimed sender's token balance.");
  }

  const verifiedRecipients: VerifiedAirdropRecipient[] = [];
  for (const walletAddress of claimedRecipientWallets) {
    const delta = deltaByOwner.get(walletAddress) ?? BigInt(0);
    // Exact match only - this is our own instruction builder's output,
    // so any divergence means the claimed transaction doesn't actually
    // correspond to this airdrop's terms.
    if (delta === amountPerRecipientRaw) {
      verifiedRecipients.push({ walletAddress, rawAmount: delta });
    }
  }

  if (verifiedRecipients.length === 0) {
    throw new Error("None of the claimed recipients were credited by this transaction.");
  }

  const totalCredited = verifiedRecipients.reduce((sum, r) => sum + r.rawAmount, BigInt(0));
  if (totalCredited > -senderDelta) {
    throw new Error("Credited recipients exceed what the sender's wallet actually sent.");
  }

  return { valid: true, verifiedRecipients };
}
