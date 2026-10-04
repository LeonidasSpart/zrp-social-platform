"use client";

import { useEffect, useState } from "react";
import { CreditCard, Loader2, Search } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getDateLocale } from "@/lib/dateLocale";
import AdminUserIdentity from "@/components/admin/AdminUserIdentity";

/*
 * Admin -> Live -> Coin Purchases (mission spec section 11). Every row
 * read from GET /api/admin/live-gifts/purchases was already verified
 * against a real on-chain USDC transaction at the moment purchaseCoins()
 * created it (src/lib/live-gifts/gift-service.ts) - this page is
 * read-only visibility, never a second trust/verification path.
 */

interface PurchaseRow {
  id: string;
  user: { id: string; username: string; name: string | null; avatarUrl: string | null };
  usdcAmount: number;
  coinsCredited: number;
  transactionId: string;
  status: "PENDING" | "COMPLETED" | "FAILED";
  createdAt: string;
}

const STATUS_STYLES: Record<PurchaseRow["status"], string> = {
  PENDING: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  COMPLETED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  FAILED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export default function AdminCoinPurchasesPage() {
  const { t, language } = useLanguage();
  const locale = getDateLocale(language);
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const limit = 25;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) qs.set("search", search);
      if (status) qs.set("status", status);
      const res = await fetch(`/api/admin/live-gifts/purchases?${qs.toString()}`);
      if (!res.ok) throw new Error(t("adminLiveGifts.errGeneric"));
      const data = await res.json();
      setRows(data.purchases || []);
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

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <CreditCard className="h-6 w-6 text-zrp-red" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("adminLiveGifts.purchasesTitle")}</h1>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
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
        {(["", "PENDING", "COMPLETED", "FAILED"] as const).map((s) => (
          <button
            key={s || "all"}
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
            {s === ""
              ? t("adminLiveGifts.filterAll")
              : s === "PENDING"
                ? t("adminLiveGifts.pending")
                : s === "COMPLETED"
                  ? t("adminLiveGifts.completed")
                  : t("adminLiveGifts.failed")}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-zrp-red" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-400">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-gray-500 dark:text-gray-400">{t("adminLiveGifts.empty")}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((p) => (
            <div
              key={p.id}
              className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-gray-700 dark:bg-gray-800"
            >
              <AdminUserIdentity
                user={p.user}
                extra={
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[p.status]}`}>{p.status}</span>
                }
              />
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-400">{t("adminLiveGifts.colUsdcAmount")}</p>
                  <p className="font-semibold text-gray-900 dark:text-white">${p.usdcAmount.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">{t("adminLiveGifts.colCoinsCredited")}</p>
                  <p className="font-medium text-gray-700 dark:text-gray-300">{p.coinsCredited}</p>
                </div>
                <div className="min-w-0 max-w-[220px]">
                  <p className="text-xs text-gray-400">{t("adminLiveGifts.colTransactionId")}</p>
                  <code className="block truncate text-xs text-gray-500 dark:text-gray-400">{p.transactionId}</code>
                </div>
                <div>
                  <p className="text-xs text-gray-400">{t("adminLiveGifts.colDate")}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(p.createdAt).toLocaleString(locale)}</p>
                </div>
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
    </div>
  );
}
