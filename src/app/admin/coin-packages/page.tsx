"use client";

import { useEffect, useState } from "react";
import { PackagePlus, Loader2, Plus, ArrowUp, ArrowDown, Pencil } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

/*
 * Admin -> Live -> Coin Packages.
 *
 * Admin-managed USDC top-up tiers, alternative/primary surface
 * alongside the existing continuous purchaseCoins() flow (which keeps
 * working unchanged). Follows the exact same template as
 * src/app/admin/live-gifts/page.tsx: table + create/edit modal,
 * enable/disable toggle, up/down reorder swapping sortOrder. There is
 * deliberately no delete button, for consistency with every other
 * catalog-style admin surface in this repo (CoinPurchase.coinPackageId
 * is onDelete:SetNull, so deleting wouldn't corrupt history either way -
 * disabling is still the only supported retirement path here).
 */

interface PackageRow {
  id: string;
  key: string;
  priceUsdc: string;
  coinsCredited: number;
  bonusCoins: number;
  enabled: boolean;
  sortOrder: number;
}

interface FormState {
  id?: string;
  key: string;
  priceUsdc: string;
  coinsCredited: string;
  bonusCoins: string;
  sortOrder: string;
  enabled: boolean;
}

const EMPTY_FORM: FormState = { key: "", priceUsdc: "", coinsCredited: "", bonusCoins: "0", sortOrder: "0", enabled: true };

export default function AdminCoinPackagesPage() {
  const { t } = useLanguage();
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [reordering, setReordering] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/coin-packages");
      if (!res.ok) throw new Error(t("adminLiveGifts.errGeneric"));
      const data = await res.json();
      setPackages((data.packages || []).slice().sort((a: PackageRow, b: PackageRow) => a.sortOrder - b.sortOrder));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("adminLiveGifts.errGeneric"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setForm({ ...EMPTY_FORM, sortOrder: String(packages.length) });
    setFormError(null);
  }

  function openEdit(p: PackageRow) {
    setForm({
      id: p.id,
      key: p.key,
      priceUsdc: p.priceUsdc,
      coinsCredited: String(p.coinsCredited),
      bonusCoins: String(p.bonusCoins),
      sortOrder: String(p.sortOrder),
      enabled: p.enabled,
    });
    setFormError(null);
  }

  async function submitForm() {
    if (!form) return;
    setFormError(null);

    const priceUsdc = Number(form.priceUsdc);
    const coinsCredited = Number(form.coinsCredited);
    const bonusCoins = Number(form.bonusCoins || "0");
    if (!Number.isFinite(priceUsdc) || priceUsdc <= 0) {
      setFormError(`${t("adminLiveGifts.colUsdcAmount")}: invalid`);
      return;
    }
    if (!Number.isInteger(coinsCredited) || coinsCredited < 1) {
      setFormError(`${t("adminLiveGifts.colCoinsCredited")}: invalid`);
      return;
    }
    if (!Number.isInteger(bonusCoins) || bonusCoins < 0) {
      setFormError(`${t("adminCoinPackages.colBonus")}: invalid`);
      return;
    }

    setSaving(true);
    try {
      const isEdit = Boolean(form.id);
      const url = isEdit ? `/api/admin/coin-packages/${form.id}` : "/api/admin/coin-packages";
      const method = isEdit ? "PATCH" : "POST";
      const body: Record<string, unknown> = {
        priceUsdc,
        coinsCredited,
        bonusCoins,
        sortOrder: Number(form.sortOrder) || 0,
        enabled: form.enabled,
      };
      if (!isEdit) body.key = form.key.trim();

      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.error || t("adminLiveGifts.errGeneric"));
        return;
      }
      setForm(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(p: PackageRow) {
    const res = await fetch(`/api/admin/coin-packages/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !p.enabled }),
    });
    if (res.ok) await load();
  }

  async function move(p: PackageRow, direction: -1 | 1) {
    const sorted = packages.slice().sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((x) => x.id === p.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];

    setReordering(p.id);
    try {
      await Promise.all([
        fetch(`/api/admin/coin-packages/${p.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: other.sortOrder }),
        }),
        fetch(`/api/admin/coin-packages/${other.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: p.sortOrder }),
        }),
      ]);
      await load();
    } finally {
      setReordering(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PackagePlus className="h-6 w-6 text-zrp-red" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("adminCoinPackages.title")}</h1>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-1.5 rounded-lg bg-zrp-red px-3 py-2 text-sm font-medium text-white hover:bg-zrp-red/90"
        >
          <Plus className="h-4 w-4" />
          {t("adminLiveGifts.create")}
        </button>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-zrp-red" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-400">
          {error}
        </div>
      ) : packages.length === 0 ? (
        <p className="py-12 text-center text-gray-500 dark:text-gray-400">{t("adminLiveGifts.empty")}</p>
      ) : (
        <div className="space-y-3">
          {packages
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((p, i, arr) => (
              <div
                key={p.id}
                className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
                    <PackagePlus className="h-5 w-5 text-gray-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-gray-900 dark:text-white">{p.key}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          p.enabled
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                        }`}
                      >
                        {p.enabled ? t("adminLiveGifts.enabled") : t("adminLiveGifts.disabled")}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      ${p.priceUsdc} · {p.coinsCredited} {t("adminLiveGifts.colCoins").toLowerCase()}
                      {p.bonusCoins > 0 ? ` · +${p.bonusCoins} ${t("adminCoinPackages.colBonus").toLowerCase()}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={i === 0 || reordering === p.id}
                    onClick={() => move(p, -1)}
                    aria-label={t("adminLiveGifts.colSortOrder")}
                    className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-30 dark:border-gray-700 dark:hover:bg-gray-700"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={i === arr.length - 1 || reordering === p.id}
                    onClick={() => move(p, 1)}
                    aria-label={t("adminLiveGifts.colSortOrder")}
                    className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-30 dark:border-gray-700 dark:hover:bg-gray-700"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleEnabled(p)}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    {p.enabled ? t("adminLiveGifts.disabled") : t("adminLiveGifts.enabled")}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(p)}
                    className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {t("adminLiveGifts.edit")}
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setForm(null)}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-bold text-gray-900 dark:text-white">
              {form.id ? t("adminLiveGifts.edit") : t("adminLiveGifts.create")} {t("adminCoinPackages.title")}
            </h2>

            <div className="space-y-3">
              {!form.id && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{t("adminLiveGifts.colKey")}</label>
                  <input
                    type="text"
                    value={form.key}
                    onChange={(e) => setForm({ ...form, key: e.target.value })}
                    placeholder="starter, popular, mega..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                  />
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{t("adminLiveGifts.colUsdcAmount")}</label>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={form.priceUsdc}
                  onChange={(e) => setForm({ ...form, priceUsdc: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{t("adminLiveGifts.colCoinsCredited")}</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={form.coinsCredited}
                  onChange={(e) => setForm({ ...form, coinsCredited: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{t("adminCoinPackages.colBonus")}</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={form.bonusCoins}
                  onChange={(e) => setForm({ ...form, bonusCoins: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{t("adminLiveGifts.colSortOrder")}</label>
                <input
                  type="number"
                  step={1}
                  value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
                {t("adminLiveGifts.enabled")}
              </label>
            </div>

            {formError && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{formError}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setForm(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                {t("adminLiveGifts.cancel")}
              </button>
              <button
                type="button"
                disabled={saving || (!form.id && !form.key.trim())}
                onClick={submitForm}
                className="flex items-center gap-1.5 rounded-lg bg-zrp-red px-4 py-2 text-sm font-medium text-white hover:bg-zrp-red/90 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("adminLiveGifts.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
