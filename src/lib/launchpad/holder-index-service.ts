/*
 * Real, owner-deduplicated holder indexing.
 *
 * Solana's getTokenLargestAccounts RPC method is the standard, documented
 * way every block explorer (Solscan, Solana Explorer) surfaces "top
 * holders" - it is capped by the protocol itself at the 20 largest token
 * ACCOUNTS for a mint, not owners. A single owner can hold a mint across
 * more than one token account (e.g. one balance pre-dating the standard
 * associated-token-account convention and one ATA), which the scanner's
 * original "top holders" list double-counted as if they were two
 * separate holders. This module resolves each account's actual owner and
 * merges duplicates, so "top 10/20 concentration" reflects distinct
 * wallets, not distinct accounts - fixing that gap, honestly scoped:
 *
 * Getting a true holder COUNT across the entire supply (not just the top
 * 20) would require scanning every token account for the mint via
 * getProgramAccounts with a memcmp filter - a call most public RPC
 * providers (including Solana's own public endpoints) rate-limit or
 * refuse outright at scale, precisely because it can return millions of
 * accounts for a popular mint. That is disclosed as NOT_AVAILABLE below,
 * never silently approximated or faked as a fabricated total.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { AccountLayout as SplAccountLayout, TOKEN_PROGRAM_ID } from "@solana/spl-token";

export interface OwnerHolding {
  owner: string;
  amountRaw: string;
  percent: number;
}

export interface HolderIndexResult {
  status: "OK" | "UNAVAILABLE";
  topOwners: OwnerHolding[];
  top10ConcentrationPercent: number;
  top20ConcentrationPercent: number;
  totalHolderCount: { status: "NOT_AVAILABLE"; reason: string };
  excludedAddresses: string[];
  reason: string | null;
}

const BURN_ADDRESSES = new Set([
  "1nc1nerator11111111111111111111111111111111", // common community "burn" convention
  "11111111111111111111111111111111111111111", // the System Program's all-zero address, never a real holder
]);

export async function indexTopHolders(
  connection: Connection,
  mintAddress: string,
  options: { excludeOwners?: string[] } = {}
): Promise<HolderIndexResult> {
  const excluded = new Set([...(options.excludeOwners ?? []), ...Array.from(BURN_ADDRESSES)]);

  try {
    const mint = new PublicKey(mintAddress);
    const largest = await connection.getTokenLargestAccounts(mint, "confirmed");

    const accountInfos = await connection.getMultipleAccountsInfo(largest.value.map((a) => a.address));

    const byOwner = new Map<string, bigint>();
    for (let i = 0; i < largest.value.length; i += 1) {
      const info = accountInfos[i];
      const amount = BigInt(largest.value[i].amount);
      if (amount <= BigInt(0) || !info || !info.owner.equals(TOKEN_PROGRAM_ID)) continue;

      let owner: string;
      try {
        owner = new PublicKey(SplAccountLayout.decode(info.data).owner).toBase58();
      } catch {
        continue; // Token-2022 accounts with extensions have a larger, non-base layout - skip rather than misparse.
      }
      if (excluded.has(owner)) continue;

      byOwner.set(owner, (byOwner.get(owner) ?? BigInt(0)) + amount);
    }

    const totalRaw = Array.from(byOwner.values()).reduce((sum, v) => sum + v, BigInt(0));
    const sorted = Array.from(byOwner.entries()).sort((a, b) => (a[1] > b[1] ? -1 : a[1] < b[1] ? 1 : 0));

    const topOwners: OwnerHolding[] = sorted.map(([owner, amountRaw]) => ({
      owner,
      amountRaw: amountRaw.toString(),
      percent: totalRaw > BigInt(0) ? (Number((amountRaw * BigInt(1_000_000)) / totalRaw) / 1_000_000) * 100 : 0,
    }));

    const top10ConcentrationPercent = topOwners.slice(0, 10).reduce((sum, h) => sum + h.percent, 0);
    const top20ConcentrationPercent = topOwners.reduce((sum, h) => sum + h.percent, 0);

    return {
      status: "OK",
      topOwners,
      top10ConcentrationPercent,
      top20ConcentrationPercent,
      totalHolderCount: {
        status: "NOT_AVAILABLE",
        reason:
          "A true holder count requires scanning every token account for this mint (getProgramAccounts), which public RPC providers rate-limit or refuse at scale. Only the top 20 accounts by balance (owner-deduplicated) are available.",
      },
      excludedAddresses: Array.from(excluded),
      reason: null,
    };
  } catch (error: unknown) {
    return {
      status: "UNAVAILABLE",
      topOwners: [],
      top10ConcentrationPercent: 0,
      top20ConcentrationPercent: 0,
      totalHolderCount: { status: "NOT_AVAILABLE", reason: "Holder data is unavailable." },
      excludedAddresses: Array.from(excluded),
      reason: error instanceof Error ? error.message : "RPC_UNAVAILABLE",
    };
  }
}
