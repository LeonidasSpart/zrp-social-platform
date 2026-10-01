import { getAssociatedTokenAddress } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { getConnection } from "@/lib/solana";

/*
 * ZRP Launchpad, phase 8: DAO governance helpers.
 *
 * Reads a wallet's CURRENT on-chain balance of a governance mint - not a
 * snapshot taken when a proposal opened. See the Dao model's doc comment
 * in schema.prisma for why this is an accepted, documented limitation
 * rather than a bug: double-voting from the SAME wallet is still
 * impossible (DaoVote's unique [proposalId, voterWalletAddress]
 * constraint), only re-voting after moving tokens to a second wallet is
 * left open, and that costs an attacker nothing beyond what splitting a
 * holding already costs before voting opens.
 */
export async function getSplTokenBalanceRaw(walletAddress: string, mintAddress: string): Promise<bigint> {
  const owner = new PublicKey(walletAddress);
  const mint = new PublicKey(mintAddress);
  const connection = getConnection();

  const ata = await getAssociatedTokenAddress(mint, owner);

  try {
    const balance = await connection.getTokenAccountBalance(ata, "confirmed");
    return BigInt(balance.value.amount);
  } catch {
    // No associated token account yet for this wallet/mint pair - a
    // zero balance, not an error (mirrors every other "never held this
    // token" case elsewhere in the launchpad).
    return BigInt(0);
  }
}

export type ProposalEffectiveStatus = "ACTIVE" | "PASSED" | "REJECTED" | "CANCELLED";

export interface DaoProposalTallyLike {
  votingEndsAt: Date;
  forRaw: { toFixed(decimals: number): string } | string;
  againstRaw: { toFixed(decimals: number): string } | string;
  abstainRaw: { toFixed(decimals: number): string } | string;
  cancelledAt: Date | null;
}

function toBigInt(value: { toFixed(decimals: number): string } | string): bigint {
  return BigInt(typeof value === "string" ? value : value.toFixed(0));
}

/*
 * Computed on every read, never stored/cron-flipped - the same pattern
 * this codebase already uses for Story's 24h expiry (application code,
 * not DB-enforced). Quorum counts ALL votes cast (for+against+abstain,
 * Governor-Bravo-style "total participation"); pass/fail compares only
 * for vs against, so an abstain affects quorum but never the outcome.
 */
export function computeProposalStatus(proposal: DaoProposalTallyLike, quorumRaw: { toFixed(decimals: number): string } | string, now: Date = new Date()): ProposalEffectiveStatus {
  if (proposal.cancelledAt) return "CANCELLED";
  if (now < proposal.votingEndsAt) return "ACTIVE";

  const forRaw = toBigInt(proposal.forRaw);
  const againstRaw = toBigInt(proposal.againstRaw);
  const abstainRaw = toBigInt(proposal.abstainRaw);
  const quorum = toBigInt(quorumRaw);

  const totalRaw = forRaw + againstRaw + abstainRaw;
  if (totalRaw < quorum) return "REJECTED";
  return forRaw > againstRaw ? "PASSED" : "REJECTED";
}
