import { getAssociatedTokenAddress } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { getConnection, getPlatformWalletPublicKey } from "@/lib/solana";

/*
 * Generalization of src/lib/solana.ts's verifyUsdcTransaction() for an
 * ARBITRARY SPL mint, not just USDC - needed for vesting deposits (and
 * later staking/farming deposits), which move a LaunchedToken's own
 * mint into platform escrow rather than a USDC fee.
 *
 * Returns raw base units (uiTokenAmount.amount, a string of the exact
 * on-chain integer) rather than verifyUsdcTransaction's floating-point
 * uiAmount - this is the one deliberate improvement over that function,
 * since a vesting contract's whole point is exact, non-lossy accounting
 * over a long time horizon.
 */
export interface SplTransferVerification {
  valid: true;
  rawAmount: bigint;
  from: string;
}

export async function verifySplTransferToPlatform(
  txHash: string,
  mintAddress: string
): Promise<SplTransferVerification> {
  if (!txHash) {
    throw new Error("Transaction signature is required.");
  }

  const mint = new PublicKey(mintAddress);
  const connection = getConnection();
  const platformPubkey = getPlatformWalletPublicKey();

  const tx = await connection.getTransaction(txHash, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });

  if (!tx) {
    throw new Error("Transaction not found.");
  }
  if (tx.meta?.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(tx.meta.err)}`);
  }

  const platformAta = await getAssociatedTokenAddress(mint, platformPubkey);
  const platformAtaStr = platformAta.toBase58();

  const preBalances = tx.meta?.preTokenBalances ?? [];
  const postBalances = tx.meta?.postTokenBalances ?? [];

  const accountKeys = tx.transaction.message.getAccountKeys
    ? tx.transaction.message.getAccountKeys().staticAccountKeys
    : (tx.transaction.message as unknown as { accountKeys: { toBase58(): string }[] }).accountKeys;

  const indexToAddress = (index: number): string =>
    accountKeys[index]?.toBase58?.() ?? String(accountKeys[index]);

  const postPlatform = postBalances.find(
    (b) => b.mint === mint.toBase58() && indexToAddress(b.accountIndex) === platformAtaStr
  );
  const prePlatform = preBalances.find(
    (b) => b.mint === mint.toBase58() && indexToAddress(b.accountIndex) === platformAtaStr
  );

  if (!postPlatform) {
    throw new Error("Transaction did not credit the platform's token account for this mint.");
  }

  const postRaw = BigInt(postPlatform.uiTokenAmount.amount || "0");
  const preRaw = BigInt(prePlatform?.uiTokenAmount.amount || "0");
  const rawAmount = postRaw - preRaw;

  if (rawAmount <= BigInt(0)) {
    throw new Error("No positive token transfer detected to the platform wallet.");
  }

  // Identify the sender: whichever non-platform account for this mint lost balance.
  let fromAddress = "";
  for (const post of postBalances) {
    if (post.mint !== mint.toBase58()) continue;
    const addr = indexToAddress(post.accountIndex);
    if (addr === platformAtaStr) continue;

    const pre = preBalances.find((b) => b.accountIndex === post.accountIndex && b.mint === mint.toBase58());
    const preAmt = BigInt(pre?.uiTokenAmount.amount || "0");
    const postAmt = BigInt(post.uiTokenAmount.amount || "0");

    if (preAmt - postAmt > BigInt(0)) {
      fromAddress = (post as { owner?: string }).owner ?? "";
      break;
    }
  }

  return { valid: true, rawAmount, from: fromAddress };
}
