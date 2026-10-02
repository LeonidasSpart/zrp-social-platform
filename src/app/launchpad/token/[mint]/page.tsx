"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Loader2, ShieldCheck, ShieldOff, Copy, Check, TrendingUp, Users, Droplets, BarChart3, Flame } from "lucide-react";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { safeExternalHref } from "@/lib/profile-website";
import { useLanguage } from "@/contexts/LanguageContext";
import { deriveCreatePoolKeys } from "@/lib/launchpad/cpmm-keys";
import {
  addLiquidityFromBrowser,
  removeLiquidityFromBrowser,
  burnLpFromBrowser,
  AmbiguousLiquidityError,
  type PoolOnChainState,
} from "@/lib/launchpad/client-liquidity";
import { connectInjectedWallet } from "@/lib/launchpad/injected-wallet";

interface TokenAnalytics {
  market: {
    priceUsdc: number | null;
    priceStatus: "OK" | "UNAVAILABLE";
    priceUnavailableReason: string | null;
    priceImpactPercent: number | null;
    fdvUsdc: number | null;
  };
  holders: {
    topHolderAccounts: Array<{ address: string; amountRaw: string; percent: number }>;
    top10ConcentrationPercent: number;
    note: string;
  };
  risk: { riskFlags: string[] };
}

const PRICE_UNAVAILABLE_LABEL: Record<string, string> = {
  NO_RELIABLE_MARKET: "No tradeable market found for this token yet.",
  SOURCE_UNREACHABLE: "Price source is temporarily unreachable.",
  INVALID_INPUT: "Price could not be determined.",
};

interface PoolInfo {
  id: string;
  poolAddress: string;
  dex: string;
  baseMint: string;
  quoteMint: string;
}

interface LiquiditySnapshot {
  poolId: string;
  poolAddress: string;
  status: "OK" | "UNAVAILABLE";
  reserveBaseRaw: string | null;
  reserveQuoteRaw: string | null;
  lpSupplyRaw: string | null;
}

interface VolumeSnapshot {
  poolId: string;
  buckets: Array<{ windowLabel: string; buyBaseRaw: string; sellBaseRaw: string; tradeCount: number }>;
}

interface LaunchedTokenDetail {
  id: string;
  mintAddress: string;
  name: string;
  symbol: string;
  description: string | null;
  imageUrl: string;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  discord: string | null;
  supply: string;
  decimals: number;
  revokeMint: boolean;
  revokeFreeze: boolean;
  revokeUpdate: boolean;
  createdAt: string;
  creator: { id: string; username: string; name: string | null; avatarUrl: string | null } | null;
}

type ManageMode = null | "add" | "remove" | "burn";

function PoolLiquidityCard({
  pool,
  snapshot,
  tradeCount,
  t,
}: {
  pool: PoolInfo;
  snapshot: LiquiditySnapshot | undefined;
  tradeCount: number | undefined;
  t: (key: Parameters<ReturnType<typeof useLanguage>["t"]>[0]) => string;
}) {
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "";
  const [mode, setMode] = useState<ManageMode>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [onChain, setOnChain] = useState<PoolOnChainState | null>(null);
  const [lpBalanceRaw, setLpBalanceRaw] = useState<bigint | null>(null);
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [lpAmount, setLpAmount] = useState("");
  const [step, setStep] = useState<"idle" | "working" | "recording">("idle");
  const [error, setError] = useState<string | null>(null);
  const [ambiguous, setAmbiguous] = useState<{ signature: string } | null>(null);
  const [done, setDone] = useState(false);

  const openMode = async (next: Exclude<ManageMode, null>) => {
    setMode(next);
    setError(null);
    setDone(false);
    if (onChain) return;
    try {
      const scanRes = await fetch(`/api/launchpad/scanner/${pool.baseMint}`);
      const scanData = await scanRes.json().catch(() => null);
      const baseProgram = scanData?.scan?.tokenProgram === "TOKEN_2022_PROGRAM" ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
      const keys = deriveCreatePoolKeys(new PublicKey(pool.baseMint), baseProgram, new PublicKey(pool.quoteMint));
      const programA = keys.mintA.equals(new PublicKey(pool.baseMint)) ? baseProgram : TOKEN_PROGRAM_ID;
      const programB = keys.mintB.equals(new PublicKey(pool.baseMint)) ? baseProgram : TOKEN_PROGRAM_ID;
      const state: PoolOnChainState = {
        poolId: keys.poolId,
        mintA: keys.mintA,
        programA,
        mintB: keys.mintB,
        programB,
        lpMint: keys.lpMint,
        vaultA: keys.vaultA,
        vaultB: keys.vaultB,
        authority: keys.authority,
      };
      setOnChain(state);

      const { walletAddress: connectedWallet } = await connectInjectedWallet();
      setWalletAddress(connectedWallet);
      const connection = new Connection(rpcUrl, "confirmed");
      const lpAccount = getAssociatedTokenAddressSync(keys.lpMint, new PublicKey(connectedWallet), false, TOKEN_PROGRAM_ID);
      try {
        const balance = await connection.getTokenAccountBalance(lpAccount);
        setLpBalanceRaw(BigInt(balance.value.amount));
      } catch {
        setLpBalanceRaw(BigInt(0));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("launchpad.pool.walletConnectFailed"));
    }
  };

  const reserveA = snapshot?.status === "OK" && snapshot.reserveBaseRaw ? BigInt(snapshot.reserveBaseRaw) : null;
  const reserveB = snapshot?.status === "OK" && snapshot.reserveQuoteRaw ? BigInt(snapshot.reserveQuoteRaw) : null;
  const lpSupply = snapshot?.status === "OK" && snapshot.lpSupplyRaw ? BigInt(snapshot.lpSupplyRaw) : null;

  const handleAdd = async () => {
    if (!onChain || reserveA === null || reserveB === null || lpSupply === null) return;
    const rawA = BigInt(Math.round(Number(amountA || "0") * 1e6));
    const rawB = BigInt(Math.round(Number(amountB || "0") * 1e6));
    if (rawA <= BigInt(0) || rawB <= BigInt(0)) return;
    try {
      setStep("working");
      await addLiquidityFromBrowser({
        rpcUrl,
        pool: onChain,
        desiredAmountA: rawA,
        desiredAmountB: rawB,
        reserveA,
        reserveB,
        lpSupply,
        slippageBps: 100,
      });
      setDone(true);
    } catch (err: unknown) {
      if (err instanceof AmbiguousLiquidityError) {
        setAmbiguous({ signature: err.signature });
      } else {
        setError(err instanceof Error ? err.message : t("launchpad.pool.createFailedGeneric"));
      }
    } finally {
      setStep("idle");
    }
  };

  const handleRemove = async () => {
    if (!onChain || reserveA === null || reserveB === null || lpSupply === null) return;
    const rawLp = BigInt(Math.round(Number(lpAmount || "0") * 1e6));
    if (rawLp <= BigInt(0)) return;
    try {
      setStep("working");
      await removeLiquidityFromBrowser({
        rpcUrl,
        pool: onChain,
        lpAmountToBurn: rawLp,
        reserveA,
        reserveB,
        lpSupply,
        slippageBps: 100,
      });
      setDone(true);
    } catch (err: unknown) {
      if (err instanceof AmbiguousLiquidityError) {
        setAmbiguous({ signature: err.signature });
      } else {
        setError(err instanceof Error ? err.message : t("launchpad.pool.createFailedGeneric"));
      }
    } finally {
      setStep("idle");
    }
  };

  const handleBurn = async () => {
    if (!onChain) return;
    const rawLp = BigInt(Math.round(Number(lpAmount || "0") * 1e6));
    if (rawLp <= BigInt(0)) return;
    try {
      setStep("working");
      await burnLpFromBrowser({ rpcUrl, lpMintAddress: onChain.lpMint.toBase58(), lpRawAmount: rawLp });
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("launchpad.pool.createFailedGeneric"));
    } finally {
      setStep("idle");
    }
  };

  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate">
          {pool.poolAddress.slice(0, 6)}...{pool.poolAddress.slice(-4)}
        </span>
        <span className="text-xs text-gray-400 dark:text-gray-500">{pool.dex === "RAYDIUM_CPMM" ? "Raydium CPMM" : pool.dex}</span>
      </div>
      {snapshot?.status === "OK" ? (
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
          Reserves: {snapshot.reserveBaseRaw} / {snapshot.reserveQuoteRaw}
        </p>
      ) : (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Liquidity unavailable</p>
      )}
      {tradeCount !== undefined && (
        <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-1">
          <BarChart3 className="h-3 w-3" /> {t("launchpad.tokenDetail.volume24hLabel")}: {tradeCount} trades
        </p>
      )}

      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={() => void openMode("add")}
          className="flex-1 rounded-md border border-gray-300 dark:border-gray-700 px-2 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:border-zrp-red transition-colors"
        >
          {t("launchpad.pool.addLiquidityButton")}
        </button>
        <button
          type="button"
          onClick={() => void openMode("remove")}
          className="flex-1 rounded-md border border-gray-300 dark:border-gray-700 px-2 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:border-zrp-red transition-colors"
        >
          {t("launchpad.pool.removeLiquidityButton")}
        </button>
        <button
          type="button"
          onClick={() => void openMode("burn")}
          className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-gray-300 dark:border-gray-700 px-2 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:border-red-500 transition-colors"
        >
          <Flame className="h-3 w-3" /> {t("launchpad.pool.burnLpButton")}
        </button>
      </div>

      {mode && (
        <div className="mt-3 rounded-md border border-gray-200 dark:border-gray-700 p-3 space-y-2">
          {walletAddress && lpBalanceRaw !== null && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t("launchpad.pool.yourLpBalanceLabel")}: {(Number(lpBalanceRaw) / 1e6).toFixed(6)}
            </p>
          )}

          {mode === "add" && (
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                inputMode="decimal"
                placeholder={t("launchpad.pool.tokenAmountLabel")}
                value={amountA}
                onChange={(e) => setAmountA(e.target.value.replace(/[^\d.]/g, ""))}
                className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
              <input
                type="text"
                inputMode="decimal"
                placeholder={t("launchpad.pool.quoteAmountLabel")}
                value={amountB}
                onChange={(e) => setAmountB(e.target.value.replace(/[^\d.]/g, ""))}
                className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
          )}

          {(mode === "remove" || mode === "burn") && (
            <input
              type="text"
              inputMode="decimal"
              placeholder={t("launchpad.pool.lpAmountLabel")}
              value={lpAmount}
              onChange={(e) => setLpAmount(e.target.value.replace(/[^\d.]/g, ""))}
              className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          )}

          {mode === "burn" && (
            <p className="text-xs text-amber-700 dark:text-amber-400">{t("launchpad.pool.burnWarning")}</p>
          )}

          {ambiguous && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("launchpad.pool.ambiguousTitle")} {t("launchpad.pool.ambiguousBody")}{" "}
              <span className="font-mono break-all">{ambiguous.signature}</span>
            </p>
          )}
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          {done && <p className="text-xs text-green-600 dark:text-green-400">{t("launchpad.pool.actionSucceeded")}</p>}

          <button
            type="button"
            onClick={() => {
              if (mode === "add") void handleAdd();
              else if (mode === "remove") void handleRemove();
              else void handleBurn();
            }}
            disabled={step !== "idle"}
            className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {step !== "idle" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {mode === "burn" ? t("launchpad.pool.burnConfirmButton") : t("launchpad.pool.confirmButton")}
          </button>
        </div>
      )}
    </div>
  );
}

function formatSupply(rawSupply: string, decimals: number): string {
  try {
    const raw = BigInt(rawSupply);
    if (decimals === 0) return raw.toLocaleString();
    let divisor = BigInt(1);
    for (let i = 0; i < decimals; i += 1) divisor *= BigInt(10);
    const whole = raw / divisor;
    return whole.toLocaleString();
  } catch {
    return rawSupply;
  }
}

export default function TokenDetailPage() {
  const params = useParams<{ mint: string }>();
  const { t } = useLanguage();
  const [token, setToken] = useState<LaunchedTokenDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [analytics, setAnalytics] = useState<TokenAnalytics | null>(null);
  const [pools, setPools] = useState<PoolInfo[]>([]);
  const [liquidity, setLiquidity] = useState<LiquiditySnapshot[]>([]);
  const [volume, setVolume] = useState<VolumeSnapshot[]>([]);

  useEffect(() => {
    if (!params.mint) return;
    setLoading(true);
    fetch(`/api/launchpad/tokens/${params.mint}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(t("launchpad.tokenDetail.notFound"));
        return res.json();
      })
      .then((data) => setToken(data.token))
      .catch(() => setError(t("launchpad.tokenDetail.notFound")))
      .finally(() => setLoading(false));

    // Independent of the ZRP-record fetch above - works for any mint,
    // not just ones ZRP itself launched. A failure here never blocks
    // the rest of the page; market/holder data simply stays absent.
    fetch(`/api/launchpad/tokens/${params.mint}/analytics`)
      .then(async (res) => (res.ok ? res.json() : null))
      .then((data) => setAnalytics(data))
      .catch(() => setAnalytics(null));

    // Real Raydium pools for this mint, if any - independent of whether
    // this token was launched on ZRP (any mint can have a real pool).
    fetch(`/api/launchpad/tokens/${params.mint}/pools`)
      .then(async (res) => (res.ok ? res.json() : null))
      .then((data) => setPools(data?.pools ?? []))
      .catch(() => setPools([]));

    fetch(`/api/launchpad/tokens/${params.mint}/liquidity`)
      .then(async (res) => (res.ok ? res.json() : null))
      .then((data) => setLiquidity(data?.pools ?? []))
      .catch(() => setLiquidity([]));

    fetch(`/api/launchpad/tokens/${params.mint}/volume`)
      .then(async (res) => (res.ok ? res.json() : null))
      .then((data) => setVolume(data?.pools ?? []))
      .catch(() => setVolume([]));
  }, [params.mint, t]);

  const handleCopy = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token.mintAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail silently - the address is still visible.
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-zrp-red" />
      </div>
    );
  }

  if (error || !token) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 dark:text-gray-400">{error || t("launchpad.tokenDetail.notFound")}</p>
      </div>
    );
  }

  const socialLinks = [
    { label: t("launchpad.tokenDetail.website"), href: safeExternalHref(token.website) },
    { label: "Twitter", href: safeExternalHref(token.twitter) },
    { label: "Telegram", href: safeExternalHref(token.telegram) },
    { label: "Discord", href: safeExternalHref(token.discord) },
  ].filter((l) => l.href);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-4">
        <Image src={token.imageUrl} alt={token.name} width={64} height={64} className="w-16 h-16 rounded-full object-cover" unoptimized />
        <div>
          <h1 className="text-2xl font-extrabold font-orbitron text-gray-900 dark:text-white">{token.name}</h1>
          <p className="text-gray-500 dark:text-gray-400">${token.symbol}</p>
        </div>
      </div>

      {token.description && <p className="text-gray-700 dark:text-gray-300 mb-4">{token.description}</p>}

      {analytics && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
            <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <TrendingUp className="h-3.5 w-3.5" /> Price
            </p>
            {analytics.market.priceStatus === "OK" && analytics.market.priceUsdc !== null ? (
              <>
                <p className="font-semibold text-gray-900 dark:text-white">
                  ${analytics.market.priceUsdc < 0.01 ? analytics.market.priceUsdc.toExponential(2) : analytics.market.priceUsdc.toFixed(4)}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">via Jupiter</p>
              </>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500">
                {PRICE_UNAVAILABLE_LABEL[analytics.market.priceUnavailableReason ?? ""] ?? "Unavailable"}
              </p>
            )}
          </div>
          <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">Fully diluted value</p>
            {analytics.market.fdvUsdc !== null ? (
              <p className="font-semibold text-gray-900 dark:text-white">
                ${analytics.market.fdvUsdc.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500">Unavailable</p>
            )}
          </div>
        </div>
      )}

      {analytics && analytics.holders.topHolderAccounts.length > 0 && (
        <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3 mb-4">
          <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-1">
            <Users className="h-3.5 w-3.5" /> Top 10 holder concentration
          </p>
          <p className="font-semibold text-gray-900 dark:text-white">{analytics.holders.top10ConcentrationPercent.toFixed(2)}%</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{analytics.holders.note}</p>
        </div>
      )}

      <div className="mb-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white mb-2">
          <Droplets className="h-4 w-4" /> {t("launchpad.tokenDetail.poolsTitle")}
        </p>
        {pools.length === 0 ? (
          <div>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-2">{t("launchpad.tokenDetail.noPoolsYet")}</p>
            <Link
              href={`/launchpad/pool/create?mint=${token.mintAddress}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-zrp-red px-3 py-1.5 text-xs font-semibold text-zrp-red hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
            >
              <Droplets className="h-3.5 w-3.5" /> {t("launchpad.pool.createPoolCta")}
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {pools.map((pool) => (
              <PoolLiquidityCard
                key={pool.id}
                pool={pool}
                snapshot={liquidity.find((l) => l.poolId === pool.id)}
                tradeCount={volume.find((v) => v.poolId === pool.id)?.buckets.find((b) => b.windowLabel === "24h")?.tradeCount}
                t={t}
              />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3 mb-4">
        <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">{t("launchpad.tokenDetail.mintAddressLabel")}</label>
        <div className="flex items-center gap-2 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
          <span className="flex-1 truncate font-mono text-xs text-gray-700 dark:text-gray-300">{token.mintAddress}</span>
          <button type="button" onClick={handleCopy} className="flex-shrink-0 text-gray-500 hover:text-zrp-red transition">
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("launchpad.tokenDetail.totalSupply")}</p>
          <p className="font-semibold text-gray-900 dark:text-white">{formatSupply(token.supply, token.decimals)}</p>
        </div>
        <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("launchpad.tokenDetail.decimals")}</p>
          <p className="font-semibold text-gray-900 dark:text-white">{token.decimals}</p>
        </div>
      </div>

      <div className="space-y-1 mb-4">
        {[
          { label: t("launchpad.tokenDetail.mintAuthority"), revoked: token.revokeMint },
          { label: t("launchpad.tokenDetail.freezeAuthority"), revoked: token.revokeFreeze },
          { label: t("launchpad.tokenDetail.updateAuthority"), revoked: token.revokeUpdate },
        ].map((row) => (
          <div key={row.label} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            {row.revoked ? <ShieldCheck className="w-4 h-4 text-green-500" /> : <ShieldOff className="w-4 h-4 text-gray-400" />}
            {row.label}: {row.revoked ? t("launchpad.tokenDetail.revoked") : t("launchpad.tokenDetail.heldByCreator")}
          </div>
        ))}
      </div>

      {socialLinks.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-4">
          {socialLinks.map((l) => (
            <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer nofollow" className="text-sm text-zrp-red hover:underline">
              {l.label}
            </a>
          ))}
        </div>
      )}

      {token.creator && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t("launchpad.tokenDetail.createdBy")}{" "}
          <Link href={`/profile/${token.creator.username}`} className="text-zrp-red hover:underline">
            @{token.creator.username}
          </Link>
        </p>
      )}
    </div>
  );
}
