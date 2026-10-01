import { PublicKey, SystemInstruction, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getConnection } from "@/lib/solana";
import { scanToken, TokenScanResult } from "./token-scanner";

/*
 * Server-side verification for the atomic, client-signed token-create
 * flow (src/lib/launchpad/client-token-mint.ts). The client fully
 * controls transaction construction now, so the server never trusts any
 * client-submitted decimals/supply/authority/name/symbol field - it
 * independently re-derives all of them from the chain (scanTokenOnChain,
 * which retries briefly for RPC propagation lag) and additionally proves
 * the SAME transaction that paid the creation fee is the one that
 * created the claimed mint account (verifyTransactionCreatedMint).
 *
 * Without that second check, a real fee payment in an unrelated plain
 * transfer could be replayed against an arbitrary pre-existing mint
 * address (e.g. a popular token's) to falsely claim authorship of it -
 * the unique constraints on mintAddress/transactionId alone don't catch
 * that, since both would be genuinely novel to our database the first
 * time someone tries it.
 */

export async function scanTokenOnChain(mintAddress: string, attempts = 3, delayMs = 1000): Promise<TokenScanResult> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await scanToken(mintAddress);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Failed to read the mint from the chain.");
}

export async function verifyTransactionCreatedMint(transactionId: string, mintAddress: string): Promise<boolean> {
  const connection = getConnection();
  const mintPubkey = new PublicKey(mintAddress);

  const tx = await connection.getTransaction(transactionId, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!tx || tx.meta?.err) return false;

  const accountKeys = tx.transaction.message.getAccountKeys
    ? tx.transaction.message.getAccountKeys().staticAccountKeys
    : (tx.transaction.message as unknown as { accountKeys: PublicKey[] }).accountKeys;

  const compiled =
    (tx.transaction.message as unknown as { compiledInstructions?: Array<{ programIdIndex: number; accountKeyIndexes: number[]; data: Uint8Array }> })
      .compiledInstructions ?? [];

  for (const ix of compiled) {
    const programId = accountKeys[ix.programIdIndex];
    if (!programId || !programId.equals(SystemProgram.programId)) continue;

    try {
      const decoded = SystemInstruction.decodeCreateAccount({
        programId: SystemProgram.programId,
        keys: ix.accountKeyIndexes.map((idx) => ({
          pubkey: accountKeys[idx],
          isSigner: false,
          isWritable: false,
        })),
        data: Buffer.from(ix.data),
      });

      if (decoded.newAccountPubkey.equals(mintPubkey) && decoded.programId.equals(TOKEN_PROGRAM_ID)) {
        return true;
      }
    } catch {
      // Not a createAccount instruction (or malformed) - keep scanning.
    }
  }

  return false;
}
