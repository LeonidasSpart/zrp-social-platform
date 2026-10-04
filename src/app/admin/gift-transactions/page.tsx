"use client";

import { useEffect, useState } from "react";
import { Receipt, Loader2, Search } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getDateLocale } from "@/lib/dateLocale";
import AdminUserIdentity from "@/components/admin/AdminUserIdentity";

/*
 * Admin -> Live -> Gift Transactions (mission spec section 10). Also
 * serves as the per-room gift inspection view (section 15) via the
 * roomId filter - the same LiveGiftTransaction ledger gift-service.ts's
 * sendGift() wrote inside its one commit, filtered server-side in
 * GET /api/admin/live-gifts/transactions, never recomputed here.
 */

interface TxRow {
  id: string;
  sender: { id: string; username: string; name: string | null; avatarUrl: string | null };
  recipient: { id: string; username: string; name: string | null; avatarUrl: string | null };
  roomType: "AUDIO" | "VIDEO";
  roomId: string | null;
  gift: { key: string; iconUrl: string | null; priceCoins: number };
  quantity: number;
  totalCoins: number;
  grossUsdc: number;
  platformFee: number;
  charityAmount: number;
  creatorAmount: number;
  createdAt: string;
}

export default function AdminGiftTransactionsPage() {
  const { t, language } = useLanguage();
  const locale = getDateLocale(language);
  const [rows, setRows] = useState<TxRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roomType, setRoomType] = useState<"" | "AUDIO" | "VIDEO">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minCoins, setMinCoins] = useState("");
  const [maxCoins, setMaxCoins] = useState("");
  const [page, setPage] = useState(1);
  const limit = 25;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) qs.set("search", search);
      if (roomType) qs.set("roomType", roomType);
      if (dateFrom) qs.set("dateFrom", dateFrom);
      if (dateTo) qs.set("dateTo", dateTo);
      if (minCoins) qs.set("minCoins", minCoins);
      if (maxCoins) qs.set("maxCoins", maxCoins);
      const res = await fetch(`/api/admin/live-gifts/transactions?${qs.toString()}`);
      if (!res.ok) throw new Error(t("adminLiveGifts.errGeneric"));
      const data = await res.json();
      setRows(data.transactions || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("adminLiveGifts.errGeneric"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, roomType, dateFrom, dateTo, minCoins, maxCoins, page]);

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <Receipt className="h-6 w-6 text-zrp-red" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("adminLiveGifts.transactionsTitle")}</h1>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="relative max-w-xs flex-1">
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
        <select
          value={roomType}
          onChange={(e) => {
            setPage(1);
            setRoomType(e.target.value as "" | "AUDIO" | "VIDEO");
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        >
          <option value="">{t("adminLiveGifts.filterAll")}</option>
          <option value="AUDIO">AUDIO</option>
          <option value="VIDEO">VIDEO</option>
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setPage(1);
            setDateFrom(e.target.value);
          }}
          title={t("adminLiveGifts.dateFrom")}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setPage(1);
            setDateTo(e.target.value);
          }}
          title={t("adminLiveGifts.dateTo")}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        />
        <input
          type="number"
          value={minCoins}
          onChange={(e) => {
            setPage(1);
            setMinCoins(e.target.value);
          }}
          placeholder={t("adminLiveGifts.minAmount")}
          className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        />
        <input
          type="number"
          value={maxCoins}
          onChange={(e) => {
            setPage(1);
            setMaxCoins(e.target.value);
          }}
          placeholder={t("adminLiveGifts.maxAmount")}
          className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        />
        {(search || roomType || dateFrom || dateTo || minCoins || maxCoins) && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setRoomType("");
              setDateFrom("");
              setDateTo("");
              setMinCoins("");
              setMaxCoins("");
              setPage(1);
            }}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {t("adminLiveGifts.clearFilters")}
          </button>
        )}
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
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              <tr>
                <th className="px-3 py-2">{t("adminLiveGifts.colSender")}</th>
                <th className="px-3 py-2">{t("adminLiveGifts.colRecipient")}</th>
                <th className="px-3 py-2">{t("adminLiveGifts.colRoomType")}</th>
                <th className="px-3 py-2">{t("adminLiveGifts.colGift")}</th>
                <th className="px-3 py-2">{t("liveGifts.quantity")}</th>
                <th className="px-3 py-2">{t("adminLiveGifts.colCoins")}</th>
                <th className="px-3 py-2">{t("adminLiveGifts.colAmount")}</th>
                <th className="px-3 py-2">{t("adminLiveGifts.colPlatformFee")}</th>
                <th className="px-3 py-2">{t("adminLiveGifts.charity")}</th>
                <th className="px-3 py-2">{t("adminLiveGifts.colCreatorAmount")}</th>
                <th className="px-3 py-2">{t("adminLiveGifts.colDate")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((r) => (
                <tr key={r.id} className="bg-white dark:bg-gray-800">
                  <td className="px-3 py-2">
                    <AdminUserIdentity user={r.sender} />
                  </td>
                  <td className="px-3 py-2">
                    <AdminUserIdentity user={r.recipient} />
                  </td>
                  <td className="px-3 py-2 text-xs font-medium text-gray-500">{r.roomType}</td>
                  <td className="px-3 py-2">{r.gift.key}</td>
                  <td className="px-3 py-2">{r.quantity}</td>
                  <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{r.totalCoins}</td>
                  <td className="px-3 py-2">${r.grossUsdc.toFixed(4)}</td>
                  <td className="px-3 py-2">${r.platformFee.toFixed(4)}</td>
                  <td className="px-3 py-2">${r.charityAmount.toFixed(4)}</td>
                  <td className="px-3 py-2">${r.creatorAmount.toFixed(4)}</td>
                  <td className="px-3 py-2 text-xs text-gray-400">{new Date(r.createdAt).toLocaleString(locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
