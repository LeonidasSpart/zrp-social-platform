/*
 * Real volume indexing: walks a Raydium CPMM pool's actual transaction
 * history (getSignaturesForAddress against the pool account itself,
 * exactly how every Solana block explorer finds a program account's
 * activity) and classifies each transaction as a real swap versus a
 * liquidity add/remove/creation, persisting only genuine swaps as
 * TokenTrade rows. This is the real, on-chain-derived alternative to
 * ever approximating "volume" from transfer counts or faked numbers -
 * every row here traces back to one specific, independently-readable
 * transaction signature.
 *
 * Classification: a deposit/withdraw moves both the base and quote vault
 * balances in the SAME direction (both up on add, both down on remove) -
 * see raydium-pool-service.ts's verifyLiquidityTransaction, which relies
 * on the same invariant. A swap moves them in OPPOSITE directions (one
 * vault's balance rises as the trader sells into it, the other falls as
 * the trader buys out of it) - that is the sole signal used here to tell
 * a swap apart from a liquidity event, rather than trying to decode
 * Raydium's swap instruction discriminator directly (which the SDK does
 * not publicly export a stable layout for). A transaction already
 * recorded as a LiquidityEvent is additionally skipped by signature, so
 * the two indexers can never double-count the same transaction.
 */

import { Connection, PublicKey, ConfirmedSignatureInfo } from "@solana/web3.js";
import { prisma } from "@/lib/db";
import { CREATE_CPMM_POOL_PROGRAM } from "@raydium-io/raydium-sdk-v2";

const ZERO = BigInt(0);
const SIGNATURES_PER_PAGE = 100;
const MAX_PAGES_PER_SYNC = 5; // bounds one cron invocation's RPC cost per pool

function getStaticAccountKeys(tx: { transaction: { message: { getAccountKeys?: () => { staticAccountKeys: PublicKey[] }; accountKeys?: PublicKey[] } } }): PublicKey[] {
  const message = tx.transaction.message;
  return message.getAccountKeys ? message.getAccountKeys().staticAccountKeys : (message.accountKeys ?? []);
}

export interface VolumeSyncResult {
  poolId: string;
  scanned: number;
  tradesRecorded: number;
  reachedEnd: boolean;
  error: string | null;
}

export async function syncPoolVolume(
  connection: Connection,
  pool: { id: string; poolAddress: string; baseVault: string; quoteVault: string; baseMint: string }
): Promise<VolumeSyncResult> {
  const result: VolumeSyncResult = { poolId: pool.id, scanned: 0, tradesRecorded: 0, reachedEnd: false, error: null };

  try {
    const syncState = await prisma.tokenVolumeSyncState.upsert({
      where: { poolAddress: pool.poolAddress },
      create: { poolAddress: pool.poolAddress },
      update: {},
    });

    const poolPubkey = new PublicKey(pool.poolAddress);
    const baseVaultPubkey = new PublicKey(pool.baseVault);
    const quoteVaultPubkey = new PublicKey(pool.quoteVault);

    let before: string | undefined;
    const stopAt = syncState.lastSignature ?? undefined;
    let newestSeen: string | null = null;

    for (let page = 0; page < MAX_PAGES_PER_SYNC; page += 1) {
      const signatures: ConfirmedSignatureInfo[] = await connection.getSignaturesForAddress(poolPubkey, {
        limit: SIGNATURES_PER_PAGE,
        before,
        until: stopAt,
      });
      if (signatures.length === 0) {
        result.reachedEnd = true;
        break;
      }
      if (!newestSeen) newestSeen = signatures[0].signature;

      for (const sigInfo of signatures) {
        result.scanned += 1;
        if (sigInfo.err) continue; // failed transactions moved no real tokens

        const alreadyRecorded = await prisma.tokenTrade.findUnique({ where: { txSignature: sigInfo.signature } });
        if (alreadyRecorded) continue;
        const isLiquidityEvent = await prisma.liquidityEvent.findUnique({ where: { transactionId: sigInfo.signature } });
        if (isLiquidityEvent) continue;

        const tx = await connection.getTransaction(sigInfo.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
        if (!tx || tx.meta?.err) continue;

        const accountKeys = getStaticAccountKeys(tx);
        if (!accountKeys.some((k) => k.equals(CREATE_CPMM_POOL_PROGRAM))) continue;

        const baseIndex = accountKeys.findIndex((k) => k.equals(baseVaultPubkey));
        const quoteIndex = accountKeys.findIndex((k) => k.equals(quoteVaultPubkey));
        if (baseIndex === -1 || quoteIndex === -1) continue;

        const basePre = tx.meta?.preTokenBalances?.find((b) => b.accountIndex === baseIndex);
        const basePost = tx.meta?.postTokenBalances?.find((b) => b.accountIndex === baseIndex);
        const quotePre = tx.meta?.preTokenBalances?.find((b) => b.accountIndex === quoteIndex);
        const quotePost = tx.meta?.postTokenBalances?.find((b) => b.accountIndex === quoteIndex);
        if (!basePost || !quotePost) continue;

        const baseDelta = BigInt(basePost.uiTokenAmount.amount) - BigInt(basePre ? basePre.uiTokenAmount.amount : "0");
        const quoteDelta = BigInt(quotePost.uiTokenAmount.amount) - BigInt(quotePre ? quotePre.uiTokenAmount.amount : "0");

        // Same-sign (or either side flat) movement is a liquidity event,
        // not a swap - a real swap always moves the two vaults in
        // opposite directions.
        const isSwap = (baseDelta > ZERO && quoteDelta < ZERO) || (baseDelta < ZERO && quoteDelta > ZERO);
        if (!isSwap) continue;

        // From the trader's perspective: they received base tokens out of
        // the base vault (its balance fell) by paying into the quote
        // vault (its balance rose) - that is a BUY of the base token.
        const side: "BUY" | "SELL" = baseDelta < ZERO ? "BUY" : "SELL";
        const baseAmountRaw = baseDelta < ZERO ? -baseDelta : baseDelta;
        const quoteAmountRaw = quoteDelta < ZERO ? -quoteDelta : quoteDelta;

        // The trader's own wallet is whichever non-vault, non-program
        // account signed the transaction.
        const signerIndex = accountKeys.findIndex((_, idx) => tx.transaction.message.isAccountSigner(idx));
        const walletAddress = signerIndex !== -1 ? accountKeys[signerIndex].toBase58() : "";

        try {
          await prisma.tokenTrade.create({
            data: {
              poolId: pool.id,
              mintAddress: pool.baseMint,
              txSignature: sigInfo.signature,
              side,
              baseAmountRaw: baseAmountRaw.toString(),
              quoteAmountRaw: quoteAmountRaw.toString(),
              walletAddress,
              blockTime: new Date((sigInfo.blockTime ?? Math.floor(Date.now() / 1000)) * 1000),
              slot: sigInfo.slot,
            },
          });
          result.tradesRecorded += 1;
        } catch (err: any) {
          if (err?.code !== "P2002") throw err; // another concurrent sync already recorded this signature - fine
        }
      }

      before = signatures[signatures.length - 1].signature;
      if (signatures.length < SIGNATURES_PER_PAGE) {
        result.reachedEnd = true;
        break;
      }
    }

    await prisma.tokenVolumeSyncState.update({
      where: { poolAddress: pool.poolAddress },
      data: { lastSignature: newestSeen ?? syncState.lastSignature, lastSyncedAt: new Date() },
    });
  } catch (error: unknown) {
    result.error = error instanceof Error ? error.message : "Unknown volume sync error";
  }

  return result;
}

export interface VolumeBucket {
  windowLabel: "5m" | "15m" | "1h" | "6h" | "24h" | "7d" | "30d";
  buyBaseRaw: string;
  sellBaseRaw: string;
  buyQuoteRaw: string;
  sellQuoteRaw: string;
  tradeCount: number;
}

const WINDOWS: Array<{ label: VolumeBucket["windowLabel"]; ms: number }> = [
  { label: "5m", ms: 5 * 60_000 },
  { label: "15m", ms: 15 * 60_000 },
  { label: "1h", ms: 60 * 60_000 },
  { label: "6h", ms: 6 * 60 * 60_000 },
  { label: "24h", ms: 24 * 60 * 60_000 },
  { label: "7d", ms: 7 * 24 * 60 * 60_000 },
  { label: "30d", ms: 30 * 24 * 60 * 60_000 },
];

/**
 * Real bucketed volume - computed from the TokenTrade rows this module
 * itself recorded, never estimated or extrapolated. A bucket with zero
 * trades genuinely had zero volume in that window; it is never
 * backfilled or smoothed.
 */
export async function getVolumeBuckets(poolId: string): Promise<VolumeBucket[]> {
  const now = Date.now();
  const earliest = new Date(now - WINDOWS[WINDOWS.length - 1].ms);
  const trades = await prisma.tokenTrade.findMany({
    where: { poolId, blockTime: { gte: earliest } },
    select: { side: true, baseAmountRaw: true, quoteAmountRaw: true, blockTime: true },
  });

  return WINDOWS.map(({ label, ms }) => {
    const cutoff = now - ms;
    const inWindow = trades.filter((t) => t.blockTime.getTime() >= cutoff);
    let buyBaseRaw = ZERO;
    let sellBaseRaw = ZERO;
    let buyQuoteRaw = ZERO;
    let sellQuoteRaw = ZERO;
    for (const t of inWindow) {
      const base = BigInt(t.baseAmountRaw.toString());
      const quote = BigInt(t.quoteAmountRaw.toString());
      if (t.side === "BUY") {
        buyBaseRaw += base;
        buyQuoteRaw += quote;
      } else {
        sellBaseRaw += base;
        sellQuoteRaw += quote;
      }
    }
    return {
      windowLabel: label,
      buyBaseRaw: buyBaseRaw.toString(),
      sellBaseRaw: sellBaseRaw.toString(),
      buyQuoteRaw: buyQuoteRaw.toString(),
      sellQuoteRaw: sellQuoteRaw.toString(),
      tradeCount: inWindow.length,
    };
  });
}
