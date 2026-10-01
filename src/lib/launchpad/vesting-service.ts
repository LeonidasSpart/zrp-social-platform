import { PublicKey, Transaction } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, createTransferInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getConnection, getPlatformWallet } from "@/lib/solana";

/*
 * ============================================================
 * ZRP Launchpad, phase 2 - vesting math + claim execution
 * ============================================================
 *
 * All arithmetic is BigInt over raw base units - never floating point.
 * zrppad's own getClaimableAmount() (src/lib/vesting.ts) did this in
 * plain JS numbers (`contract.total_amount * fraction`), which loses
 * precision for large supplies/long durations; there is no reason to
 * carry that forward here when BigInt division is exact and just as
 * simple.
 */

export interface VestingContractLike {
  totalAmount: Prisma.Decimal;
  totalReleased: Prisma.Decimal;
  cliffSeconds: number;
  vestingSeconds: number;
  startAt: Date;
  status: string;
}

/**
 * How much of a vesting contract is claimable right now, in raw base
 * units. Zero before the cliff. Linear over vestingSeconds after the
 * cliff (vestingSeconds <= 0 means "fully unlocked the instant the
 * cliff passes" - a pure cliff with no further linear release).
 */
export function computeClaimableRaw(contract: VestingContractLike, now: Date = new Date()): bigint {
  const ZERO = BigInt(0);
  if (contract.status !== "ACTIVE") return ZERO;

  const elapsedSec = Math.floor((now.getTime() - contract.startAt.getTime()) / 1000);
  if (elapsedSec < contract.cliffSeconds) return ZERO;

  const totalAmount = BigInt(contract.totalAmount.toFixed(0));
  const totalReleased = BigInt(contract.totalReleased.toFixed(0));

  let totalVested: bigint;
  if (contract.vestingSeconds <= 0) {
    totalVested = totalAmount;
  } else {
    const vestingElapsed = Math.min(elapsedSec - contract.cliffSeconds, contract.vestingSeconds);
    totalVested = (totalAmount * BigInt(vestingElapsed)) / BigInt(contract.vestingSeconds);
    if (totalVested > totalAmount) totalVested = totalAmount;
  }

  const claimable = totalVested - totalReleased;
  return claimable > ZERO ? claimable : ZERO;
}

export interface ExecuteClaimResult {
  success: boolean;
  signature?: string;
  error?: string;
  // True only when a transaction was actually broadcast (sendRawTransaction
  // returned a signature) but its on-chain outcome then could not be
  // confirmed - e.g. an RPC timeout mid-confirmation. The transfer may
  // have genuinely succeeded. Callers MUST NOT treat this the same as a
  // definite failure: do not re-open the contract for another claim and
  // do not assume the funds are still at the platform. A confirmed
  // `confirmation.value.err` (the transaction landed and failed
  // atomically - nothing moved) is the only case safe to revert.
  ambiguous?: boolean;
}

/**
 * Sends `claimableRaw` of `mintAddress` from the platform's escrow ATA
 * to the beneficiary's ATA (created if needed, platform pays the rent -
 * same as sendUsdc()'s recipient-ATA handling), then atomically records
 * the release and increments the contract's totalReleased.
 *
 * Does not attempt crash-safe checkpointing of the broadcast signature
 * before confirmation - same accepted scope boundary as mint-service.ts
 * (see its own comment). What IS handled here is distinguishing that
 * ambiguous state from a definite on-chain failure (see
 * ExecuteClaimResult.ambiguous) so the caller can refuse to let a second
 * claim through instead of silently allowing a double-payout.
 */
export async function executeVestingClaim(params: {
  contractId: string;
  mintAddress: string;
  beneficiaryWalletAddress: string;
  claimableRaw: bigint;
}): Promise<ExecuteClaimResult> {
  const { contractId, mintAddress, beneficiaryWalletAddress, claimableRaw } = params;

  const connection = getConnection();
  const platform = getPlatformWallet();
  const mint = new PublicKey(mintAddress);
  const beneficiary = new PublicKey(beneficiaryWalletAddress);

  let signature: string | undefined;
  try {
    const platformAta = await getOrCreateAssociatedTokenAccount(connection, platform, mint, platform.publicKey);
    const beneficiaryAta = await getOrCreateAssociatedTokenAccount(connection, platform, mint, beneficiary);

    const transaction = new Transaction().add(
      createTransferInstruction(platformAta.address, beneficiaryAta.address, platform.publicKey, claimableRaw, [], TOKEN_PROGRAM_ID)
    );
    transaction.feePayer = platform.publicKey;

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("finalized");
    transaction.recentBlockhash = blockhash;
    transaction.sign(platform);

    signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
      preflightCommitment: "confirmed",
    });

    const confirmation = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
    if (confirmation.value.err) {
      console.error(`Vesting claim ${contractId} failed on-chain:`, confirmation.value.err);
      return { success: false, error: `Transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`, ambiguous: false };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error while claiming.";
    // A signature means sendRawTransaction already succeeded - the
    // failure happened waiting on confirmation, so the transfer's real
    // outcome is unknown, not "didn't happen".
    const ambiguous = signature !== undefined;
    console.error(
      `Vesting claim ${contractId} transfer error (ambiguous=${ambiguous}${signature ? `, signature=${signature}` : ""}):`,
      error
    );
    return { success: false, error: message, ambiguous, signature };
  }

  await prisma.$transaction(async (tx) => {
    await tx.vestingRelease.create({
      data: { vestingContractId: contractId, amount: claimableRaw.toString(), transactionId: signature },
    });
    const contract = await tx.vestingContract.update({
      where: { id: contractId },
      data: { totalReleased: { increment: claimableRaw.toString() } },
    });
    if (BigInt(contract.totalReleased.toFixed(0)) >= BigInt(contract.totalAmount.toFixed(0))) {
      await tx.vestingContract.update({ where: { id: contractId }, data: { status: "COMPLETED" } });
    }
  });

  return { success: true, signature };
}
