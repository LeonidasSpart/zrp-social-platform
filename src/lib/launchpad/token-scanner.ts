import { Connection, PublicKey } from "@solana/web3.js";
import { getMint, getTokenMetadata, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TokenInvalidAccountOwnerError } from "@solana/spl-token";
import { Metadata } from "@metaplex-foundation/mpl-token-metadata";
import { getConnection } from "@/lib/solana";
import { deriveMetadataPda } from "./metaplex-metadata";

/*
 * ============================================================
 * ZRP Launchpad, phase 10: token-check scanner. Read-only on-chain
 * inspection of ANY SPL token (not just ones ZRP minted) - no custody,
 * no transaction, nothing to sign. The point is giving a user the same
 * authority/concentration checks a careful trader would do manually
 * before buying into an unfamiliar token, surfaced in one call.
 *
 * "Never fake an integration" (see livekit.ts): if the RPC call fails
 * (bad mint, network issue, account doesn't exist), this throws a real,
 * CLASSIFIED error rather than returning a fabricated all-clear result -
 * a scanner that silently reports "looks safe" on failure, or that
 * collapses every distinct failure into one generic message, would be
 * worse than no scanner at all.
 *
 * Production incident fixed here: scanToken() always called getMint()
 * with its default programId (the classic SPL Token program). Any
 * Token-2022 mint - a real, increasingly common token standard, not an
 * edge case - is owned by a DIFFERENT program (TOKEN_2022_PROGRAM_ID),
 * so getMint() threw TokenInvalidAccountOwnerError for every single one,
 * and the route's catch-all turned that into a generic "may not exist or
 * the RPC is unavailable" - which actively misleads: the token exists,
 * the RPC is fine, the code just asked the wrong on-chain program.
 * Fixed by resolving the owning program from the raw account first
 * (resolveTokenProgram below) and calling every program-aware RPC
 * helper with the program id that account actually reported.
 */

export type TokenScanErrorCode =
  | "INVALID_MINT"
  | "TOKEN_NOT_FOUND"
  | "UNSUPPORTED_TOKEN_PROGRAM"
  | "RPC_UNAVAILABLE"
  | "RPC_TIMEOUT"
  | "INTERNAL_SCAN_ERROR";

export class TokenScanError extends Error {
  readonly code: TokenScanErrorCode;
  readonly cause?: unknown;

  constructor(code: TokenScanErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "TokenScanError";
    this.code = code;
    this.cause = cause;
  }
}

export type TokenProgramKind = "TOKEN_PROGRAM" | "TOKEN_2022_PROGRAM";

export interface TokenScanResult {
  mintAddress: string;
  tokenProgram: TokenProgramKind;
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

/** Classifies a thrown RPC/network error into a safe, debuggable code - never guesses "all clear" on ambiguity. */
function classifyRpcError(err: unknown): TokenScanError {
  if (err instanceof TokenScanError) return err;
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  const name = err instanceof Error ? err.name : "";
  if (name === "AbortError" || lower.includes("timeout") || lower.includes("timed out")) {
    return new TokenScanError("RPC_TIMEOUT", "The Solana RPC endpoint took too long to respond.", err);
  }
  if (
    lower.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("fetch failed") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("network error") ||
    lower.includes("failed to fetch")
  ) {
    return new TokenScanError("RPC_UNAVAILABLE", "The Solana RPC endpoint is unreachable or rate-limiting requests.", err);
  }
  return new TokenScanError("INTERNAL_SCAN_ERROR", "An unexpected error occurred while scanning this token.", err);
}

/**
 * Reads the raw account once to determine which SPL token program (if
 * any) actually owns this mint, before any program-specific call is
 * made. This is the fix for the Token-2022 crash: every downstream call
 * uses the programId resolved here instead of silently assuming classic
 * SPL Token.
 */
async function resolveTokenProgram(
  connection: Connection,
  mint: PublicKey
): Promise<{ programId: PublicKey; kind: TokenProgramKind }> {
  let accountInfo;
  try {
    accountInfo = await connection.getAccountInfo(mint);
  } catch (err) {
    throw classifyRpcError(err);
  }

  if (!accountInfo) {
    throw new TokenScanError(
      "TOKEN_NOT_FOUND",
      `No account exists at ${mint.toBase58()} on the network this scanner is connected to.`
    );
  }
  if (accountInfo.owner.equals(TOKEN_PROGRAM_ID)) return { programId: TOKEN_PROGRAM_ID, kind: "TOKEN_PROGRAM" };
  if (accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) return { programId: TOKEN_2022_PROGRAM_ID, kind: "TOKEN_2022_PROGRAM" };

  throw new TokenScanError(
    "UNSUPPORTED_TOKEN_PROGRAM",
    `The account at ${mint.toBase58()} is owned by ${accountInfo.owner.toBase58()}, which is not a known SPL token program.`
  );
}

export async function scanToken(mintAddress: string): Promise<TokenScanResult> {
  let mint: PublicKey;
  try {
    mint = new PublicKey(mintAddress);
  } catch (err) {
    throw new TokenScanError("INVALID_MINT", `"${mintAddress}" is not a valid base58 Solana address.`, err);
  }

  const connection = getConnection();
  const { programId, kind } = await resolveTokenProgram(connection, mint);

  let mintInfo;
  try {
    mintInfo = await getMint(connection, mint, "confirmed", programId);
  } catch (err) {
    // Can still land here if the account's owner changed between the
    // resolveTokenProgram() read and this call, or if the address is a
    // token ACCOUNT rather than its mint (same owning program, wrong
    // account shape) - both are genuinely "not a scannable mint", not a
    // network problem.
    if (err instanceof TokenInvalidAccountOwnerError) {
      throw new TokenScanError("UNSUPPORTED_TOKEN_PROGRAM", "This account is not a valid SPL token mint.", err);
    }
    throw classifyRpcError(err);
  }

  let metadata: TokenScanResult["metadata"] = null;

  if (kind === "TOKEN_2022_PROGRAM") {
    try {
      const nativeMetadata = await getTokenMetadata(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
      if (nativeMetadata) {
        metadata = {
          name: nativeMetadata.name.replace(/\0/g, "").trim(),
          symbol: nativeMetadata.symbol.replace(/\0/g, "").trim(),
          uri: nativeMetadata.uri.replace(/\0/g, "").trim(),
          // Token-2022's native metadata extension has no explicit
          // isMutable flag the way Metaplex does - an absent
          // updateAuthority IS the "permanently fixed" state.
          updateAuthority: nativeMetadata.updateAuthority?.toBase58() ?? "",
          isMutable: nativeMetadata.updateAuthority !== undefined,
        };
      }
    } catch {
      // No native metadata extension on this Token-2022 mint - fall
      // through to the classic Metaplex PDA check below, since a
      // Token-2022 mint can still carry Metaplex metadata instead of
      // (or alongside) the newer on-mint extension.
    }
  }

  if (!metadata) {
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
      // No metadata account for this mint under either standard - a
      // real, reportable state (flagged below as metadata_missing), not
      // an error for the scan as a whole.
    }
  }

  let largest;
  try {
    largest = await connection.getTokenLargestAccounts(mint);
  } catch (err) {
    throw classifyRpcError(err);
  }

  const supplyRaw = mintInfo.supply;
  const topHolders = largest.value.slice(0, 10).map((acc) => ({
    address: acc.address.toBase58(),
    amountRaw: acc.amount,
    percent: supplyRaw > BigInt(0) ? Number((BigInt(acc.amount) * BigInt(10000)) / supplyRaw) / 100 : 0,
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
    tokenProgram: kind,
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
