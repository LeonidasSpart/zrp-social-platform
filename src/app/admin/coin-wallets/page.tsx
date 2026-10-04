"use client";

import { useEffect, useState } from "react";
import { Coins, Loader2, Search, Wallet as WalletIcon, X, Zap } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getDateLocale } from "@/lib/dateLocale";
import AdminUserIdentity from "@/components/admin/AdminUserIdentity";

/*
 * Admin -> Live -> Coin Wallets (mission spec section 5). Reads real
 * CoinWallet rows + aggregated CoinPurchase/LiveGiftTransaction totals
 * from GET /api/admin/live-gifts/coin-wallets - no mock data, no
 * client-computed totals. Also doubles as the entry point into the
 * audited admin coin-adjustment flow (mission spec section 12).
 */

interface WalletRow {
  userId: string;
  user: { id: string; username: string; name: string | null; avatarUrl: string | null; badgeType: string | null };
  balance: number;
  totalPurchased: number;
  totalSpent: number;
  lastPurchaseAt: string | null;
  lastGiftAt: string | null;
  status: "ACTIVE" | "SUSPENDED" | "RESTRICTED";
}

interface QuickGrantUser {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  badgeType: string | null;
  banned: boolean;
  balance: number;
}

const STATUS_FILTERS = ["ALL", "ACTIVE", "SUSPENDED", "RESTRICTED", "ZERO", "POSITIVE"] as const;

// Scaled down from the amounts shown in other platforms' reference UIs: ZRP's coin
// peg is a real $0.01 USDC per coin (COIN_VALUE_USDC), so a six-figure chip there
// would be a five-figure real-dollar click here. These represent $1 / $5 / $10 / $50.
const QUICK_GRANT_CHIPS = [100, 500, 1000, 5000];

export default function AdminCoinWalletsPage() {
  const { t, language } = useLanguage();
  const locale = getDateLocale(language);
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("ALL");
  const [page, setPage] = useState(1);
  const [adjustTarget, setAdjustTarget] = useState<WalletRow | null>(null);
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const limit = 25;

  const [quickQuery, setQuickQuery] = useState("");
  const [quickResults, setQuickResults] = useState<QuickGrantUser[]>([]);
  const [quickSearching, setQuickSearching] = useState(false);
  const [quickSelected, setQuickSelected] = useState<QuickGrantUser | null>(null);
  const [quickAmount, setQuickAmount] = useState("");
  const [quickReason, setQuickReason] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickSuccess, setQuickSuccess] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) qs.set("search", search);
      if (status !== "ALL") qs.set("status", status);
      const res = await fetch(`/api/admin/live-gifts/coin-wallets?${qs.toString()}`);
      if (!res.ok) throw new Error(t("adminLiveGifts.errGeneric"));
      const data = await res.json();
      setWallets(data.wallets || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("adminLiveGifts.errGeneric"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, page]);

  useEffect(() => {
    const q = quickQuery.trim();
    if (!q) {
      setQuickResults([]);
      setQuickSearching(false);
      return;
    }
    setQuickSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/live-gifts/coin-wallets/search?q=${encodeURIComponent(q)}`);
        const data = await res.json().catch(() => ({ results: [] }));
        setQuickResults(res.ok ? data.results || [] : []);
      } catch {
        setQuickResults([]);
      } finally {
        setQuickSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [quickQuery]);

  function selectQuickUser(u: QuickGrantUser) {
    setQuickSelected(u);
    setQuickResults([]);
    setQuickQuery("");
    setQuickAmount("");
    setQuickReason("");
    setQuickError(null);
    setQuickSuccess(false);
  }

  function clearQuickSelection() {
    setQuickSelected(null);
    setQuickAmount("");
    setQuickReason("");
    setQuickError(null);
    setQuickSuccess(false);
  }

  async function submitQuickGrant() {
    if (!quickSelected) return;
    const delta = Number(quickAmount);
    if (!Number.isInteger(delta) || delta === 0) {
      setQuickError(t("adminLiveGifts.errGeneric"));
      return;
    }
    if (!quickReason.trim()) {
      setQuickError(t("adminLiveGifts.reason"));
      return;
    }
    const confirmMsg = t("adminLiveGifts.adjustConfirm")
      .replace("{name}", quickSelected.username)
      .replace("{delta}", String(delta));
    if (!window.confirm(confirmMsg)) return;

    setQuickSaving(true);
    setQuickError(null);
    setQuickSuccess(false);
    try {
      const res = await fetch(`/api/admin/live-gifts/coin-wallets/${quickSelected.id}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta, reason: quickReason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setQuickError(data.error || t("adminLiveGifts.errGeneric"));
        return;
      }
      setQuickSelected((prev) => (prev ? { ...prev, balance: prev.balance + delta } : prev));
      setQuickAmount("");
      setQuickReason("");
      setQuickSuccess(true);
      await load();
    } finally {
      setQuickSaving(false);
    }
  }

  async function submitAdjustment() {
    if (!adjustTarget) return;
    const delta = Number(adjustDelta);
    if (!Number.isInteger(delta) || delta === 0) {
      setAdjustError("delta");
      return;
    }
    if (!adjustReason.trim()) {
      setAdjustError(t("adminLiveGifts.reason"));
      return;
    }
    const confirmMsg = t("adminLiveGifts.adjustConfirm")
      .replace("{name}", adjustTarget.user.username)
      .replace("{delta}", String(delta));
    if (!window.confirm(confirmMsg)) return;

    setAdjustSaving(true);
    setAdjustError(null);
    try {
      const res = await fetch(`/api/admin/live-gifts/coin-wallets/${adjustTarget.userId}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta, reason: adjustReason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAdjustError(data.error || t("adminLiveGifts.errGeneric"));
        return;
      }
      setAdjustTarget(null);
      setAdjustDelta("");
      setAdjustReason("");
      await load();
    } finally {
      setAdjustSaving(false);
    }
  }

  const statusStyles: Record<WalletRow["status"], string> = {
    ACTIVE: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    SUSPENDED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    RESTRICTED: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  };
  const statusLabel: Record<WalletRow["status"], string> = {
    ACTIVE: t("adminLiveGifts.active"),
    SUSPENDED: t("adminLiveGifts.suspended"),
    RESTRICTED: t("adminLiveGifts.restricted"),
  };

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <WalletIcon className="h-6 w-6 text-zrp-red" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("adminLiveGifts.walletsTitle")}</h1>
      </div>

      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-1 flex items-center gap-2">
          <Zap className="h-4 w-4 text-zrp-red" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{t("adminLiveGifts.quickGrantTitle")}</h2>
        </div>
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("adminLiveGifts.quickGrantDescription")}</p>

        {!quickSelected ? (
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={quickQuery}
              onChange={(e) => setQuickQuery(e.target.value)}
              placeholder={t("adminLiveGifts.quickGrantSearchPlaceholder")}
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
            />
            {quickQuery.trim() && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
                {quickSearching ? (
                  <div className="flex items-center justify-center p-3">
                    <Loader2 className="h-4 w-4 animate-spin text-zrp-red" />
                  </div>
                ) : quickResults.length === 0 ? (
                  <p className="p-3 text-center text-sm text-gray-500 dark:text-gray-400">
                    {t("adminLiveGifts.quickGrantNoResults")}
                  </p>
                ) : (
                  quickResults.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => selectQuickUser(u)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      <AdminUserIdentity user={u} />
                      <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                        <Coins className="h-3 w-3 text-yellow-500" /> {u.balance}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            <div className="flex items-start justify-between gap-2">
              <AdminUserIdentity
                user={quickSelected}
                extra={
                  <span className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                    <Coins className="h-3 w-3 text-yellow-500" /> {quickSelected.balance}
                  </span>
                }
              />
              <button
                type="button"
                onClick={clearQuickSelection}
                aria-label={t("adminLiveGifts.quickGrantClearSelection")}
                className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK_GRANT_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setQuickAmount(String(chip))}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    quickAmount === String(chip)
                      ? "bg-zrp-red text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-700"
                  }`}
                >
                  +{chip.toLocaleString()}
                </button>
              ))}
            </div>

            <label className="mb-1 mt-3 block text-xs font-medium text-gray-500 dark:text-gray-400">
              {t("adminLiveGifts.delta")}
            </label>
            <input
              type="number"
              step={1}
              value={quickAmount}
              onChange={(e) => setQuickAmount(e.target.value)}
              placeholder={t("adminLiveGifts.quickGrantAmountPlaceholder")}
              className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
            />

            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
              {t("adminLiveGifts.reason")}
            </label>
            <textarea
              value={quickReason}
              onChange={(e) => setQuickReason(e.target.value)}
              rows={2}
              className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
            />

            {quickError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{quickError}</p>}
            {quickSuccess && !quickError && (
              <p className="mb-3 text-sm text-green-600 dark:text-green-400">{t("adminLiveGifts.quickGrantSuccess")}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={clearQuickSelection}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                {t("adminLiveGifts.cancel")}
              </button>
              <button
                type="button"
                disabled={quickSaving}
                onClick={submitQuickGrant}
                className="flex items-center gap-1.5 rounded-lg bg-zrp-red px-4 py-2 text-sm font-medium text-white hover:bg-zrp-red/90 disabled:opacity-50"
              >
                {quickSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("adminLiveGifts.quickGrantApply")}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder={t("adminLiveGifts.search")}
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setPage(1);
                setStatus(s);
              }}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                status === s
                  ? "bg-zrp-red text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              {s === "ALL"
                ? t("adminLiveGifts.filterAll")
                : s === "ACTIVE"
                  ? t("adminLiveGifts.active")
                  : s === "SUSPENDED"
                    ? t("adminLiveGifts.suspended")
                    : s === "RESTRICTED"
                      ? t("adminLiveGifts.restricted")
                      : s === "ZERO"
                        ? t("adminLiveGifts.filterZeroBalance")
                        : t("adminLiveGifts.filterPositiveBalance")}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-zrp-red" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-400">
          {error}
        </div>
      ) : wallets.length === 0 ? (
        <p className="py-12 text-center text-gray-500 dark:text-gray-400">{t("adminLiveGifts.empty")}</p>
      ) : (
        <div className="space-y-3">
          {wallets.map((w) => (
            <div
              key={w.userId}
              className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-gray-700 dark:bg-gray-800"
            >
              <AdminUserIdentity
                user={w.user}
                extra={
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[w.status]}`}>
                    {statusLabel[w.status]}
                  </span>
                }
              />
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-400">{t("adminLiveGifts.colBalance")}</p>
                  <p className="flex items-center gap-1 font-semibold text-gray-900 dark:text-white">
                    <Coins className="h-3.5 w-3.5 text-yellow-500" /> {w.balance}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">{t("adminLiveGifts.statTotalCoinsSpent")}</p>
                  <p className="font-medium text-gray-700 dark:text-gray-300">{w.totalSpent}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">{t("adminLiveGifts.colLastPurchase")}</p>
                  <p className="text-gray-500 dark:text-gray-400">
                    {w.lastPurchaseAt ? new Date(w.lastPurchaseAt).toLocaleDateString(locale) : t("adminLiveGifts.none")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">{t("adminLiveGifts.colLastGift")}</p>
                  <p className="text-gray-500 dark:text-gray-400">
                    {w.lastGiftAt ? new Date(w.lastGiftAt).toLocaleDateString(locale) : t("adminLiveGifts.none")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAdjustTarget(w);
                    setAdjustDelta("");
                    setAdjustReason("");
                    setAdjustError(null);
                  }}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  {t("adminLiveGifts.adjustBalance")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {total > limit && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 disabled:opacity-40 dark:border-gray-700"
          >
            ←
          </button>
          <span className="text-gray-500 dark:text-gray-400">
            {page} / {Math.max(1, Math.ceil(total / limit))}
          </span>
          <button
            type="button"
            disabled={page * limit >= total}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 disabled:opacity-40 dark:border-gray-700"
          >
            →
          </button>
        </div>
      )}

      {adjustTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setAdjustTarget(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-lg font-bold text-gray-900 dark:text-white">{t("adminLiveGifts.adjustBalance")}</h2>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">@{adjustTarget.user.username}</p>

            <div className="mb-3 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-900">
              <span className="text-gray-500">{t("adminLiveGifts.beforeBalance")}</span>
              <span className="font-semibold text-gray-900 dark:text-white">{adjustTarget.balance}</span>
            </div>

            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{t("adminLiveGifts.delta")}</label>
            <input
              type="number"
              step={1}
              value={adjustDelta}
              onChange={(e) => setAdjustDelta(e.target.value)}
              placeholder="+50 / -50"
              className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
            />

            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{t("adminLiveGifts.reason")}</label>
            <textarea
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              rows={3}
              className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
            />

            {adjustDelta && Number.isInteger(Number(adjustDelta)) && (
              <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                {t("adminLiveGifts.afterBalance")}: {adjustTarget.balance + (Number(adjustDelta) || 0)}
              </p>
            )}

            {adjustError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{adjustError}</p>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdjustTarget(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                {t("adminLiveGifts.cancel")}
              </button>
              <button
                type="button"
                disabled={adjustSaving}
                onClick={submitAdjustment}
                className="flex items-center gap-1.5 rounded-lg bg-zrp-red px-4 py-2 text-sm font-medium text-white hover:bg-zrp-red/90 disabled:opacity-50"
              >
                {adjustSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("adminLiveGifts.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
