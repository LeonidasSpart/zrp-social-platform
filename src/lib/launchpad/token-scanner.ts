import { PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
import { Metadata } from "@metaplex-foundation/mpl-token-metadata";
import { getConnection } from "@/lib/solana";
import { deriveMetadataPda } from "./metaplex-metadata";

/*
 * ZRP Launchpad, phase 10: token-check scanner. Read-only on-chain
 * inspection of ANY SPL token (not just ones ZRP minted) - no custody,
 * no transaction, nothing to sign. The point is giving a user the same
 * authority/concentration checks a careful trader would do manually
 * before buying into an unfamiliar token, surfaced in one call.
 *
 * "Never fake an integration" (see livekit.ts): if the RPC call fails
 * (bad mint, network issue, account doesn't exist), this throws a real
 * error rather than returning a fabricated all-clear result - a scanner
 * that silently reports "looks safe" on failure would be worse than no
 * scanner at all.
 */

export interface TokenScanResult {
  mintAddress: string;
  supplyRaw: string;
  decimals: number;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  metadata: {
    name: string;
    symbol: string;
    uri: string;
    updateAuthority: string;
    isMutable: boolean;
  } | null;
  topHolders: Array<{ address: string; amountRaw: string; percent: number }>;
  topHolderConcentrationPercent: number;
  riskFlags: TokenRiskFlag[];
}

export type TokenRiskFlag =
  | "mint_authority_active"
  | "freeze_authority_active"
  | "metadata_mutable"
  | "metadata_missing"
  | "high_holder_concentration";

const HIGH_CONCENTRATION_THRESHOLD_PERCENT = 50;

export async function scanToken(mintAddress: string): Promise<TokenScanResult> {
  const mint = new PublicKey(mintAddress);
  const connection = getConnection();

  const mintInfo = await getMint(connection, mint);

  let metadata: TokenScanResult["metadata"] = null;
  try {
    const [metadataPda] = deriveMetadataPda(mint);
    const onChainMetadata = await Metadata.fromAccountAddress(connection, metadataPda);
    metadata = {
      name: onChainMetadata.data.name.replace(/\0/g, "").trim(),
      symbol: onChainMetadata.data.symbol.replace(/\0/g, "").trim(),
      uri: onChainMetadata.data.uri.replace(/\0/g, "").trim(),
      updateAuthority: onChainMetadata.updateAuthority.toBase58(),
      isMutable: onChainMetadata.isMutable,
    };
  } catch {
    // No metadata account for this mint - a real, reportable state
    // (flagged below as metadata_missing), not an error for the scan
    // as a whole.
  }

  const largest = await connection.getTokenLargestAccounts(mint);
  const supplyRaw = mintInfo.supply;
  const topHolders = largest.value.slice(0, 10).map((acc) => ({
    address: acc.address.toBase58(),
    amountRaw: acc.amount,
    percent: supplyRaw > BigInt(0) ? (Number(BigInt(acc.amount) * BigInt(10000) / supplyRaw) / 100) : 0,
  }));
  // Sum of the top holders fetched (already capped at 10 above), not
  // just the single largest - a token split across several large
  // wallets (e.g. ten at ~9% each, 90% combined) is just as
  // concentrated as one wallet holding 90% alone, and should trip the
  // same risk flag. Matches zrppad's own top-10-sum approach.
  const topHolderConcentrationPercent = topHolders.reduce((sum, holder) => sum + holder.percent, 0);

  const riskFlags: TokenRiskFlag[] = [];
  if (mintInfo.mintAuthority) riskFlags.push("mint_authority_active");
  if (mintInfo.freezeAuthority) riskFlags.push("freeze_authority_active");
  if (!metadata) riskFlags.push("metadata_missing");
  else if (metadata.isMutable) riskFlags.push("metadata_mutable");
  if (topHolderConcentrationPercent >= HIGH_CONCENTRATION_THRESHOLD_PERCENT) riskFlags.push("high_holder_concentration");

  return {
    mintAddress,
    supplyRaw: supplyRaw.toString(),
    decimals: mintInfo.decimals,
    mintAuthority: mintInfo.mintAuthority?.toBase58() ?? null,
    freezeAuthority: mintInfo.freezeAuthority?.toBase58() ?? null,
    metadata,
    topHolders,
    topHolderConcentrationPercent,
    riskFlags,
  };
}
