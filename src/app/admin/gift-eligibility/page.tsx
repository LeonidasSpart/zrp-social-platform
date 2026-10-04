"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Loader2, Search } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getDateLocale } from "@/lib/dateLocale";
import AdminUserIdentity from "@/components/admin/AdminUserIdentity";
import type { TranslationKey } from "@/lib/translations";

/*
 * Admin -> Live -> Gift Eligibility (mission spec section 6). Every row
 * is a server-calculated snapshot from GET /api/admin/live-gifts/
 * eligibility (computeGiftEligibility in src/lib/live-gifts/
 * eligibility.ts) - never a client-side permission. The Restrict/
 * Unrestrict action here writes the one UserGiftPolicy row
 * gift-service.ts's sendGift() itself reads to actually enforce it.
 */

type Reason = "ACCOUNT_SUSPENDED" | "NO_ACTIVE_ACCOUNT" | "GIFT_RESTRICTED" | "NO_COINS" | "ROOM_NOT_ELIGIBLE" | "ELIGIBLE";

interface EligRow {
  userId: string;
  eligible: boolean;
  reason: Reason;
  giftRestricted: boolean;
  restrictionReason: string | null;
  coinBalance: number;
  lastGiftAt: string | null;
  lastCoinPurchaseAt: string | null;
  user: { id: string; username: string; name: string | null; avatarUrl: string | null; badgeType: string | null } | null;
}

const REASON_KEY: Record<Reason, TranslationKey> = {
  ACCOUNT_SUSPENDED: "adminLiveGifts.suspended",
  NO_ACTIVE_ACCOUNT: "adminLiveGifts.reasonNoActiveAccount",
  GIFT_RESTRICTED: "adminLiveGifts.reasonGiftRestricted",
  NO_COINS: "adminLiveGifts.reasonNoCoins",
  ROOM_NOT_ELIGIBLE: "adminLiveGifts.reasonRoomNotEligible",
  ELIGIBLE: "adminLiveGifts.yes",
};

export default function AdminGiftEligibilityPage() {
  const { t, language } = useLanguage();
  const locale = getDateLocale(language);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<EligRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restrictTarget, setRestrictTarget] = useState<EligRow | null>(null);
  const [restrictReason, setRestrictReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (search) qs.set("search", search);
      const res = await fetch(`/api/admin/live-gifts/eligibility?${qs.toString()}`);
      if (!res.ok) throw new Error(t("adminLiveGifts.errGeneric"));
      const data = await res.json();
      setResults(data.results || []);
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
  }, [search]);

  async function setPolicy(userId: string, canSendGifts: boolean, reason?: string) {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/admin/live-gifts/eligibility/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canSendGifts, reason: reason ?? null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(data.error || t("adminLiveGifts.errGeneric"));
        return;
      }
      setRestrictTarget(null);
      setRestrictReason("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-zrp-red" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("adminLiveGifts.eligibilityTitle")}</h1>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("adminLiveGifts.search")}
          className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
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
      ) : results.length === 0 ? (
        <p className="py-12 text-center text-gray-500 dark:text-gray-400">{t("adminLiveGifts.empty")}</p>
      ) : (
        <div className="space-y-3">
          {results.map((r) => (
            <div
              key={r.userId}
              className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-gray-700 dark:bg-gray-800"
            >
              {r.user ? (
                <AdminUserIdentity
                  user={r.user}
                  extra={
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.eligible
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                      }`}
                    >
                      {r.eligible ? t("adminLiveGifts.yes") : t(REASON_KEY[r.reason])}
                    </span>
                  }
                />
              ) : (
                <span className="text-sm text-gray-400">{r.userId}</span>
              )}

              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-400">{t("adminLiveGifts.colBalance")}</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{r.coinBalance}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">{t("adminLiveGifts.colLastGift")}</p>
                  <p className="text-gray-500 dark:text-gray-400">
                    {r.lastGiftAt ? new Date(r.lastGiftAt).toLocaleDateString(locale) : t("adminLiveGifts.none")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">{t("adminLiveGifts.colLastPurchase")}</p>
                  <p className="text-gray-500 dark:text-gray-400">
                    {r.lastCoinPurchaseAt ? new Date(r.lastCoinPurchaseAt).toLocaleDateString(locale) : t("adminLiveGifts.none")}
                  </p>
                </div>
                {r.giftRestricted ? (
                  <button
                    type="button"
                    onClick={() => setPolicy(r.userId, true)}
                    disabled={saving}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    {t("adminLiveGifts.unrestrict")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setRestrictTarget(r);
                      setRestrictReason("");
                      setSaveError(null);
                    }}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-900/10"
                  >
                    {t("adminLiveGifts.restrict")}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {restrictTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setRestrictTarget(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-lg font-bold text-gray-900 dark:text-white">{t("adminLiveGifts.restrict")}</h2>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">@{restrictTarget.user?.username}</p>

            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{t("adminLiveGifts.reason")}</label>
            <textarea
              value={restrictReason}
              onChange={(e) => setRestrictReason(e.target.value)}
              rows={3}
              className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
            />

            {saveError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{saveError}</p>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRestrictTarget(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                {t("adminLiveGifts.cancel")}
              </button>
              <button
                type="button"
                disabled={saving || !restrictReason.trim()}
                onClick={() => setPolicy(restrictTarget.userId, false, restrictReason.trim())}
                className="flex items-center gap-1.5 rounded-lg bg-zrp-red px-4 py-2 text-sm font-medium text-white hover:bg-zrp-red/90 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("adminLiveGifts.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
