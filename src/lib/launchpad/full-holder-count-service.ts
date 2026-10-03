/*
 * Real total unique-holder counting, for background indexing only.
 *
 * holder-index-service.ts (PR #444) deliberately only covers the top 20
 * accounts by balance (getTokenLargestAccounts is a protocol-level cap)
 * and explicitly reports a true total count as NOT_AVAILABLE, because a
 * full getProgramAccounts scan is too expensive to run on every live page
 * request. That's still true for a live request - but the Launchpad's
 * AnalyticsSnapshot cron and discovery ranking are NOT live requests: they
 * run on a fixed interval against a bounded, already-known set of active
 * tokens (see the launchpad-analytics-snapshot cron route), which is
 * exactly the situation a background indexer is for. This module is that
 * indexer: a genuine, owner-deduplicated, exclusion-aware COUNT of every
 * token account for a mint, read only on that schedule - never from a
 * request handler, and never backfilled as a guess when it can't finish
 * cleanly. A token with more open accounts than MAX_ACCOUNTS_TO_SCAN
 * honestly reports UNAVAILABLE rather than truncating silently.
 *
 * dataSlice trims each fetched account to just its owner (32 bytes) and
 * amount (8 bytes) fields - 40 bytes instead of the full 165-byte SPL
 * Token account layout - to keep the RPC response bounded for a popular
 * mint with many holders.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

const TOKEN_ACCOUNT_SIZE = 165;
const MINT_FIELD_OFFSET = 0;
const OWNER_FIELD_OFFSET = 32;
const OWNER_AND_AMOUNT_SLICE_LENGTH = 40; // owner (32 bytes) + amount (8 bytes)

// Above this many open token accounts for one mint, a full scan is judged
// too RPC-expensive even for a background job - reported as UNAVAILABLE,
// never truncated and presented as a real total.
const MAX_ACCOUNTS_TO_SCAN = 50_000;

export interface FullHolderCountResult {
  status: "OK" | "UNAVAILABLE";
  holderCount: number | null;
  reason: string | null;
}

export async function indexFullHolderCount(
  connection: Connection,
  mintAddress: string,
  options: { excludeOwners?: string[] } = {}
): Promise<FullHolderCountResult> {
  const excluded = new Set(options.excludeOwners ?? []);

  try {
    const mint = new PublicKey(mintAddress);
    const accounts = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
      commitment: "confirmed",
      filters: [
        { dataSize: TOKEN_ACCOUNT_SIZE },
        { memcmp: { offset: MINT_FIELD_OFFSET, bytes: mint.toBase58() } },
      ],
      dataSlice: { offset: OWNER_FIELD_OFFSET, length: OWNER_AND_AMOUNT_SLICE_LENGTH },
    });

    if (accounts.length > MAX_ACCOUNTS_TO_SCAN) {
      return {
        status: "UNAVAILABLE",
        holderCount: null,
        reason: `Too many open token accounts (${accounts.length}) to safely enumerate a holder count for this mint.`,
      };
    }

    const owners = new Set<string>();
    for (const { account } of accounts) {
      const data = account.data as Buffer;
      if (data.length < OWNER_AND_AMOUNT_SLICE_LENGTH) continue;
      const amount = data.readBigUInt64LE(32);
      if (amount <= BigInt(0)) continue;
      const owner = new PublicKey(data.subarray(0, 32)).toBase58();
      if (excluded.has(owner)) continue;
      owners.add(owner);
    }

    return { status: "OK", holderCount: owners.size, reason: null };
  } catch (error: unknown) {
    return {
      status: "UNAVAILABLE",
      holderCount: null,
      reason: error instanceof Error ? error.message : "RPC_UNAVAILABLE",
    };
  }
}
