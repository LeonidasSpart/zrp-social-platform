"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { Loader2, ShieldCheck, ShieldOff, Copy, Check, TrendingUp, Users, Droplets, BarChart3, Flame, Rocket, GraduationCap, LineChart as LineChartIcon } from "lucide-react";
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
import { buyOnCurve, sellOnCurve, AmbiguousTradeError } from "@/lib/launchpad/client-bonding-curve";
import { buyOnZrpCurve, sellOnZrpCurve, AmbiguousZrpLaunchError } from "@/lib/launchpad/client-zrp-launch";
import { connectInjectedWallet } from "@/lib/launchpad/injected-wallet";
import type { HistoryChartPoint } from "@/components/launchpad/TokenHistoryChart";

const TokenMetricChart = dynamic(
  () => import("@/components/launchpad/TokenHistoryChart").then((m) => m.TokenMetricChart),
  { ssr: false }
);

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

interface CurveState {
  status: "OK" | "NO_CURVE" | "UNSUPPORTED_CURVE_VARIANT" | "UNAVAILABLE";
  reason: string | null;
  bondingCurveAddress: string;
  graduated: boolean;
  realQuoteLamports: string | null;
  realTokenReservesRaw: string | null;
  priceDisplay: string | null;
  progressBps: number | null;
}

interface CurveQuote {
  status: "OK" | "NO_CURVE" | "GRADUATED" | "UNSUPPORTED_CURVE_VARIANT" | "UNAVAILABLE";
  reason: string | null;
  tokenAmountRaw: string | null;
  solAmountLamports: string | null;
  totalFeeLamports: string | null;
  minimumReceivedRaw: string | null;
}

interface GraduationCheck {
  graduated: boolean;
  poolAddress: string | null;
  poolAccountExists: boolean;
  record: { migrationVerified: boolean } | null;
}

interface PumpSwapPoolState {
  status: "OK" | "NOT_FOUND" | "UNAVAILABLE";
  baseReserveRaw: string | null;
  quoteReserveRaw: string | null;
  priceDisplay: string | null;
}

function lamportsToSol(raw: string | null): string {
  if (!raw) return "0";
  try {
    return (Number(BigInt(raw)) / 1e9).toLocaleString(undefined, { maximumFractionDigits: 6 });
  } catch {
    return "0";
  }
}

type HistoryMetric = "price" | "volume" | "liquidity" | "holders";
type HistoryRange = "5m" | "15m" | "1h" | "6h" | "24h" | "7d" | "30d";

interface HistoryApiPoint {
  timestamp: string;
  price?: string | null;
  totalVolumeLamports?: string;
  liquidityTotalLamports?: string;
  holderCount?: number | null;
}

interface HistoryApiResponse {
  status: "OK" | "NO_HISTORY";
  points: HistoryApiPoint[];
  insufficientHistory: { available: boolean; firstObservedAt: string | null; message: string | null };
}

function TokenHistorySection({ mintAddress, t }: { mintAddress: string; t: ReturnType<typeof useLanguage>["t"] }) {
  const [metric, setMetric] = useState<HistoryMetric>("price");
  const [range, setRange] = useState<HistoryRange>("24h");
  const [data, setData] = useState<HistoryApiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/launchpad/tokens/${mintAddress}/history?metric=${metric}&range=${range}`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mintAddress, metric, range]);

  const points: HistoryChartPoint[] = (data?.points ?? []).map((p) => {
    let value: number | null = null;
    switch (metric) {
      case "price":
        value = p.price ? Number(p.price) : null;
        break;
      case "volume":
        value = p.totalVolumeLamports ? Number(p.totalVolumeLamports) / 1e9 : null;
        break;
      case "liquidity":
        value = p.liquidityTotalLamports ? Number(p.liquidityTotalLamports) / 1e9 : null;
        break;
      case "holders":
        value = typeof p.holderCount === "number" ? p.holderCount : null;
        break;
    }
    return { timestamp: p.timestamp, value };
  });

  const metricLabels: Record<HistoryMetric, string> = {
    price: t("launchpad.history.metricPrice"),
    volume: t("launchpad.history.metricVolume"),
    liquidity: t("launchpad.history.metricLiquidity"),
    holders: t("launchpad.history.metricHolders"),
  };
  const rangeLabels: Record<HistoryRange, string> = {
    "5m": t("launchpad.history.range5m"),
    "15m": t("launchpad.history.range15m"),
    "1h": t("launchpad.history.range1h"),
    "6h": t("launchpad.history.range6h"),
    "24h": t("launchpad.history.range24h"),
    "7d": t("launchpad.history.range7d"),
    "30d": t("launchpad.history.range30d"),
  };

  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-700 p-4 mb-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white mb-3">
        <LineChartIcon className="h-4 w-4" /> {t("launchpad.history.heading")}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex gap-1">
          {(Object.keys(metricLabels) as HistoryMetric[]).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                metric === m
                  ? "bg-zrp-red text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              {metricLabels[m]}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(Object.keys(rangeLabels) as HistoryRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                range === r
                  ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
              }`}
            >
              {rangeLabels[r]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">{t("launchpad.history.loadingChart")}</p>
      ) : !data || data.status === "NO_HISTORY" || points.every((p) => p.value === null) ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">{t("launchpad.history.noHistory")}</p>
      ) : (
        <>
          <TokenMetricChart points={points} t={t} />
          {data.insufficientHistory.available && data.insufficientHistory.message && data.insufficientHistory.firstObservedAt && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
              {t("launchpad.history.insufficientHistory", {
                date: new Date(data.insufficientHistory.firstObservedAt).toLocaleString(),
              })}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function BondingCurveCard({ mintAddress, decimals, t }: { mintAddress: string; decimals: number; t: ReturnType<typeof useLanguage>["t"] }) {
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "";
  const [curve, setCurve] = useState<CurveState | null>(null);
  const [venue, setVenue] = useState<"ZRP_LAUNCH" | "PUMP_CURVE">("PUMP_CURVE");
  const [graduation, setGraduation] = useState<GraduationCheck | null>(null);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<CurveQuote | null>(null);
  const [step, setStep] = useState<"idle" | "quoting" | "working" | "recording">("idle");
  const [error, setError] = useState<string | null>(null);
  const [ambiguous, setAmbiguous] = useState<{ signature: string } | null>(null);
  const [done, setDone] = useState(false);
  const [pumpSwapPool, setPumpSwapPool] = useState<PumpSwapPoolState | null>(null);

  useEffect(() => {
    fetch(`/api/launchpad/tokens/${mintAddress}/curve`)
      .then((res) => res.json())
      .then((data) => {
        setCurve(data.curve ?? null);
        setVenue(data.venue === "ZRP_LAUNCH" ? "ZRP_LAUNCH" : "PUMP_CURVE");
      })
      .catch(() => setCurve(null));
    fetch(`/api/launchpad/tokens/${mintAddress}/graduation`)
      .then((res) => res.json())
      .then((data) => setGraduation(data))
      .catch(() => setGraduation(null));
  }, [mintAddress]);

  useEffect(() => {
    if (!graduation?.graduated || !graduation.poolAccountExists) {
      setPumpSwapPool(null);
      return;
    }
    fetch(`/api/launchpad/tokens/${mintAddress}/pumpswap-pool`)
      .then((res) => res.json())
      .then((data) => setPumpSwapPool(data.pool ?? null))
      .catch(() => setPumpSwapPool(null));
  }, [mintAddress, graduation?.graduated, graduation?.poolAccountExists]);

  useEffect(() => {
    setQuote(null);
    setError(null);
    const numeric = Number(amount || "0");
    if (!amount || numeric <= 0) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setStep("quoting");
      const rawAmount =
        side === "buy" ? BigInt(Math.round(numeric * 1e9)).toString() : BigInt(Math.round(numeric * 10 ** decimals)).toString();
      fetch(`/api/launchpad/tokens/${mintAddress}/curve?side=${side}&amount=${rawAmount}&slippageBps=100`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data) => setQuote(data.quote ?? null))
        .catch(() => {})
        .finally(() => setStep("idle"));
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [amount, side, mintAddress, decimals]);

  if (!curve || curve.status === "NO_CURVE") return null;

  const handleTrade = async () => {
    if (!quote || quote.status !== "OK" || !quote.tokenAmountRaw || !quote.solAmountLamports) return;
    try {
      setStep("working");
      setError(null);
      setDone(false);
      const minimumReceivedRaw = BigInt(quote.minimumReceivedRaw ?? "0");
      const result =
        venue === "ZRP_LAUNCH"
          ? side === "buy"
            ? await buyOnZrpCurve({
                rpcUrl,
                mintAddress,
                solLamports: BigInt(quote.solAmountLamports),
                minTokensOut: minimumReceivedRaw,
              })
            : await sellOnZrpCurve({
                rpcUrl,
                mintAddress,
                tokenAmountRaw: BigInt(quote.tokenAmountRaw),
                minSolOut: minimumReceivedRaw,
              })
          : side === "buy"
            ? await buyOnCurve({
                rpcUrl,
                mintAddress,
                solLamports: BigInt(quote.solAmountLamports),
                quotedTokenAmountRaw: BigInt(quote.tokenAmountRaw),
                slippagePercent: 1,
              })
            : await sellOnCurve({
                rpcUrl,
                mintAddress,
                tokenAmountRaw: BigInt(quote.tokenAmountRaw),
                quotedSolLamports: BigInt(quote.solAmountLamports),
                slippagePercent: 1,
              });

      setStep("recording");
      await fetch(`/api/launchpad/curve/${side}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mintAddress, walletAddress: result.walletAddress, transactionId: result.signature }),
      });
      setDone(true);
      setAmount("");
      setQuote(null);
    } catch (err: unknown) {
      if (err instanceof AmbiguousTradeError || err instanceof AmbiguousZrpLaunchError) {
        setAmbiguous({ signature: err.signature });
      } else {
        setError(err instanceof Error ? err.message : t("launchpad.pool.createFailedGeneric"));
      }
    } finally {
      setStep("idle");
    }
  };

  const progressPercent = curve.progressBps !== null ? curve.progressBps / 100 : 0;

  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-700 p-4 mb-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white mb-3">
        {graduation?.graduated ? <GraduationCap className="h-4 w-4" /> : <Rocket className="h-4 w-4" />}
        {t("launchpad.curve.heading")}
      </p>

      {graduation?.graduated ? (
        <div className="space-y-1">
          <p className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
            {t("launchpad.curve.statusGraduated")}
          </p>
          <p
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ml-1.5 ${
              graduation.record?.migrationVerified
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
            }`}
          >
            {graduation.record?.migrationVerified
              ? t("launchpad.curve.migrationVerified")
              : t("launchpad.curve.migrationPending")}
          </p>
          {graduation.poolAddress && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {t("launchpad.curve.poolAddressLabel")}:{" "}
              <span className="font-mono">{graduation.poolAddress.slice(0, 6)}...{graduation.poolAddress.slice(-4)}</span>
              {!graduation.poolAccountExists && <span className="ml-1 text-amber-600 dark:text-amber-400">({t("launchpad.curve.unavailable")})</span>}
            </p>
          )}
          {graduation.poolAccountExists && pumpSwapPool && (
            pumpSwapPool.status === "OK" ? (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t("launchpad.idoDetail.priceLabel")}</p>
                  <p className="font-semibold text-gray-900 dark:text-white text-sm">{pumpSwapPool.priceDisplay ?? "-"} SOL</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t("launchpad.curve.liquidityLabel")}</p>
                  <p className="font-semibold text-gray-900 dark:text-white text-sm">{lamportsToSol(pumpSwapPool.quoteReserveRaw)} SOL</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">{t("launchpad.curve.unavailable")}</p>
            )
          )}
        </div>
      ) : curve.status !== "OK" ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          {curve.status === "UNSUPPORTED_CURVE_VARIANT" ? t("launchpad.curve.unsupportedVariant") : t("launchpad.curve.unavailable")}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("launchpad.idoDetail.priceLabel")}</p>
              <p className="font-semibold text-gray-900 dark:text-white text-sm">{curve.priceDisplay} SOL</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("launchpad.curve.raisedLabel")}</p>
              <p className="font-semibold text-gray-900 dark:text-white text-sm">{lamportsToSol(curve.realQuoteLamports)} SOL</p>
            </div>
          </div>
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
              <span>{t("launchpad.curve.progressLabel")}</span>
              <span>{progressPercent.toFixed(1)}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div className="h-full bg-zrp-red" style={{ width: `${Math.min(100, progressPercent)}%` }} />
            </div>
          </div>

          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => {
                setSide("buy");
                setAmount("");
              }}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${side === "buy" ? "bg-green-600 text-white" : "border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300"}`}
            >
              {t("launchpad.curve.buyButton")}
            </button>
            <button
              type="button"
              onClick={() => {
                setSide("sell");
                setAmount("");
              }}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${side === "sell" ? "bg-red-600 text-white" : "border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300"}`}
            >
              {t("launchpad.curve.sellButton")}
            </button>
          </div>

          <input
            type="text"
            inputMode="decimal"
            placeholder={side === "buy" ? t("launchpad.pool.quoteAmountLabel") : t("launchpad.pool.tokenAmountLabel")}
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white mb-2"
          />

          {quote && quote.status === "OK" && (
            <div className="rounded-md bg-gray-50 dark:bg-gray-800/50 p-2 text-xs text-gray-600 dark:text-gray-400 space-y-0.5 mb-2">
              <p>
                {t("launchpad.curve.estimatedReceiveLabel")}:{" "}
                {side === "buy" ? (Number(quote.tokenAmountRaw) / 10 ** decimals).toLocaleString() : `${lamportsToSol(quote.solAmountLamports)} SOL`}
              </p>
              <p>{t("launchpad.curve.feeLabel")}: {lamportsToSol(quote.totalFeeLamports)} SOL</p>
              <p>
                {t("launchpad.curve.minReceivedLabel")}:{" "}
                {side === "buy" ? (Number(quote.minimumReceivedRaw) / 10 ** decimals).toLocaleString() : `${lamportsToSol(quote.minimumReceivedRaw)} SOL`}
              </p>
            </div>
          )}

          {ambiguous && (
            <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">
              {t("launchpad.pool.ambiguousTitle")} {t("launchpad.pool.ambiguousBody")}{" "}
              <span className="font-mono break-all">{ambiguous.signature}</span>
            </p>
          )}
          {error && <p className="text-xs text-red-600 dark:text-red-400 mb-2">{error}</p>}
          {done && <p className="text-xs text-green-600 dark:text-green-400 mb-2">{t("launchpad.pool.actionSucceeded")}</p>}

          <button
            type="button"
            onClick={() => void handleTrade()}
            disabled={step !== "idle" || !quote || quote.status !== "OK"}
            className={`inline-flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-50 ${side === "buy" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}
          >
            {step !== "idle" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {side === "buy" ? t("launchpad.curve.buyButton") : t("launchpad.curve.sellButton")}
          </button>
        </>
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

      <TokenHistorySection mintAddress={token.mintAddress} t={t} />

      <BondingCurveCard mintAddress={token.mintAddress} decimals={token.decimals} t={t} />

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
