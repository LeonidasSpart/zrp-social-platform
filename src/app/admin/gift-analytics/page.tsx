"use client";

import { useEffect, useState } from "react";
import { BarChart3, Loader2, Gift as GiftIcon } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import AdminUserIdentity from "@/components/admin/AdminUserIdentity";

/*
 * Admin -> Live -> Gift Analytics (mission spec section 13), and the
 * creator drill-down of section 14 via the creatorId filter. Every
 * number comes straight from GET /api/admin/live-gifts/analytics, which
 * aggregates the real LiveGiftTransaction ledger - no mock data, no
 * client-side math beyond formatting.
 */

interface Analytics {
  totalGifts: number;
  totalCoinsSpent: number;
  totalUsdcValue: number;
  totalPlatformFee: number;
  totalCharity: number;
  totalCreatorAmount: number;
  audioCount: number;
  videoCount: number;
  topGifts: { gift: { key: string; iconUrl: string | null } | null; totalCoins: number; quantity: number }[];
  topSenders: { user: { id: string; username: string; name: string | null; avatarUrl: string | null } | null; totalCoins: number }[];
  topCreators: {
    user: { id: string; username: string; name: string | null; avatarUrl: string | null } | null;
    creatorAmount: number;
    totalCoins: number;
  }[];
  dailyTrend: { date: string; gifts: number; coins: number }[];
  creatorRooms?: { roomType: "AUDIO" | "VIDEO"; roomId: string; lastGiftAt: string }[];
}

export default function AdminGiftAnalyticsPage() {
  const { t } = useLanguage();
  const [creatorId, setCreatorId] = useState("");
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (creatorId) qs.set("creatorId", creatorId);
      const res = await fetch(`/api/admin/live-gifts/analytics?${qs.toString()}`);
      if (!res.ok) throw new Error(t("adminLiveGifts.errGeneric"));
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("adminLiveGifts.errGeneric"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(load, creatorId ? 400 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorId]);

  const maxDayCoins = data ? Math.max(1, ...data.dailyTrend.map((d) => d.coins)) : 1;

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <BarChart3 className="h-6 w-6 text-zrp-red" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("adminLiveGifts.analyticsTitle")}</h1>
      </div>

      <div className="mb-4 max-w-sm">
        <input
          type="text"
          value={creatorId}
          onChange={(e) => setCreatorId(e.target.value)}
          placeholder={`${t("adminLiveGifts.colUserId")} (${t("adminLiveGifts.statTopCreators")})`}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        />
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-zrp-red" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-400">
          {error}
        </div>
      ) : data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label={t("adminLiveGifts.statTotalGifts")} value={data.totalGifts} />
            <StatCard label={t("adminLiveGifts.statTotalCoinsSpent")} value={data.totalCoinsSpent} />
            <StatCard label={t("adminLiveGifts.statTotalUsdcValue")} value={`$${data.totalUsdcValue.toFixed(2)}`} />
            <StatCard label={t("adminLiveGifts.colPlatformFee")} value={`$${data.totalPlatformFee.toFixed(2)}`} />
            <StatCard label={t("adminLiveGifts.charity")} value={`$${data.totalCharity.toFixed(2)}`} />
            <StatCard label={t("adminLiveGifts.statCreatorEarnings")} value={`$${data.totalCreatorAmount.toFixed(2)}`} />
          </div>

          {!creatorId && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{t("adminLiveGifts.statAudioVsVideo")}</h2>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                <div
                  className="h-full bg-zrp-red"
                  style={{ width: `${(data.audioCount / Math.max(1, data.audioCount + data.videoCount)) * 100}%` }}
                />
                <div
                  className="h-full bg-blue-400"
                  style={{ width: `${(data.videoCount / Math.max(1, data.audioCount + data.videoCount)) * 100}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                AUDIO: {data.audioCount} · VIDEO: {data.videoCount}
              </p>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">{t("adminLiveGifts.statDailyTrend")}</h2>
            {data.dailyTrend.length === 0 ? (
              <p className="text-sm text-gray-400">{t("adminLiveGifts.empty")}</p>
            ) : (
              <div className="flex h-32 items-end gap-1">
                {data.dailyTrend.map((d) => (
                  <div key={d.date} className="group relative flex-1" title={`${d.date}: ${d.coins}`}>
                    <div
                      className="w-full rounded-t bg-zrp-red/70 transition hover:bg-zrp-red"
                      style={{ height: `${Math.max(2, (d.coins / maxDayCoins) * 100)}%` }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <RankedList
              title={t("adminLiveGifts.statTopGifts")}
              rows={data.topGifts.map((g) => ({
                key: g.gift?.key ?? "—",
                label: g.gift?.key ?? t("adminLiveGifts.unknown"),
                value: `${g.totalCoins} (${g.quantity}×)`,
              }))}
              icon={<GiftIcon className="h-4 w-4 text-gray-400" />}
            />
            <RankedList
              title={t("adminLiveGifts.statTopSenders")}
              rows={data.topSenders.map((s) => ({
                key: s.user?.id ?? Math.random().toString(),
                label: s.user ? `@${s.user.username}` : t("adminLiveGifts.unknown"),
                value: String(s.totalCoins),
                user: s.user,
              }))}
            />
            {!creatorId && (
              <RankedList
                title={t("adminLiveGifts.statTopCreators")}
                rows={data.topCreators.map((c) => ({
                  key: c.user?.id ?? Math.random().toString(),
                  label: c.user ? `@${c.user.username}` : t("adminLiveGifts.unknown"),
                  value: `$${c.creatorAmount.toFixed(2)}`,
                  user: c.user,
                }))}
              />
            )}
          </div>

          {creatorId && data.creatorRooms && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">{t("adminLiveGifts.colRoom")}</h2>
              {data.creatorRooms.length === 0 ? (
                <p className="text-sm text-gray-400">{t("adminLiveGifts.empty")}</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {data.creatorRooms.map((r) => (
                    <li key={r.roomId} className="flex justify-between text-gray-600 dark:text-gray-300">
                      <span>
                        {r.roomType} · {r.roomId}
                      </span>
                      <span className="text-gray-400">{new Date(r.lastGiftAt).toLocaleDateString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

function RankedList({
  title,
  rows,
  icon,
}: {
  title: string;
  rows: { key: string; label: string; value: string; user?: { id: string; username: string; name: string | null; avatarUrl: string | null } | null }[];
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300">
        {icon}
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">—</p>
      ) : (
        <ol className="space-y-2 text-sm">
          {rows.map((r, i) => (
            <li key={r.key} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2 text-gray-600 dark:text-gray-300">
                <span className="text-xs text-gray-400">{i + 1}.</span>
                {r.user ? <AdminUserIdentity user={r.user} /> : <span className="truncate">{r.label}</span>}
              </span>
              <span className="flex-shrink-0 font-medium text-gray-900 dark:text-white">{r.value}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
