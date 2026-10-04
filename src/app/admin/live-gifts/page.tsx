"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Gift as GiftIcon, Loader2, Plus, ArrowUp, ArrowDown, Pencil } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

/*
 * Admin -> Live -> Gifts (Gift Catalog management).
 *
 * The engine (GiftDefinition schema, gift-service.ts, the admin
 * GET/POST/PATCH routes this page calls) already existed and is
 * untouched here. This page is the missing operational layer: create
 * the first real gifts (the catalog can genuinely be empty - see
 * CLAUDE.md), edit price/icon/animation, enable/disable, and reorder.
 * There is deliberately no delete button - GiftDefinition.giftDefinitionId
 * is onDelete: Restrict on LiveGiftTransaction, so a priced gift that's
 * ever been sent can never be removed; disabling is the only supported
 * retirement path, enforced by the database itself.
 */

const RARITIES = ["COMMON", "RARE", "EPIC", "LEGENDARY"] as const;
const MIN_TIERS = ["free", "pro", "business", "enterprise"] as const;

interface GiftRow {
  id: string;
  key: string;
  priceCoins: number;
  iconUrl: string | null;
  animationUrl: string | null;
  soundUrl: string | null;
  category: string | null;
  rarity: string | null;
  minTier: string | null;
  availableFrom: string | null;
  availableTo: string | null;
  enabled: boolean;
  sortOrder: number;
}

interface FormState {
  id?: string;
  key: string;
  priceCoins: string;
  iconUrl: string;
  animationUrl: string;
  soundUrl: string;
  category: string;
  rarity: string;
  minTier: string;
  availableFrom: string;
  availableTo: string;
  sortOrder: string;
  enabled: boolean;
}

const EMPTY_FORM: FormState = {
  key: "",
  priceCoins: "",
  iconUrl: "",
  animationUrl: "",
  soundUrl: "",
  category: "",
  rarity: "",
  minTier: "",
  availableFrom: "",
  availableTo: "",
  sortOrder: "0",
  enabled: true,
};

/** <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm", no timezone/seconds. */
function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminLiveGiftsPage() {
  const { t } = useLanguage();
  const [gifts, setGifts] = useState<GiftRow[]>([]);
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
      const res = await fetch("/api/admin/live-gifts");
      if (!res.ok) throw new Error(t("adminLiveGifts.errGeneric"));
      const data = await res.json();
      setGifts((data.gifts || []).slice().sort((a: GiftRow, b: GiftRow) => a.sortOrder - b.sortOrder));
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
    setForm({ ...EMPTY_FORM, sortOrder: String(gifts.length) });
    setFormError(null);
  }

  function openEdit(g: GiftRow) {
    setForm({
      id: g.id,
      key: g.key,
      priceCoins: String(g.priceCoins),
      iconUrl: g.iconUrl || "",
      animationUrl: g.animationUrl || "",
      soundUrl: g.soundUrl || "",
      category: g.category || "",
      rarity: g.rarity || "",
      minTier: g.minTier || "",
      availableFrom: toDatetimeLocal(g.availableFrom),
      availableTo: toDatetimeLocal(g.availableTo),
      sortOrder: String(g.sortOrder),
      enabled: g.enabled,
    });
    setFormError(null);
  }

  async function submitForm() {
    if (!form) return;
    setFormError(null);

    const priceCoins = Number(form.priceCoins);
    if (!Number.isInteger(priceCoins) || priceCoins < 1) {
      setFormError(t("adminLiveGifts.colPrice") + ": invalid");
      return;
    }

    setSaving(true);
    try {
      const isEdit = Boolean(form.id);
      const url = isEdit ? `/api/admin/live-gifts/${form.id}` : "/api/admin/live-gifts";
      const method = isEdit ? "PATCH" : "POST";
      const body: Record<string, unknown> = {
        priceCoins,
        iconUrl: form.iconUrl || null,
        animationUrl: form.animationUrl || null,
        soundUrl: form.soundUrl || null,
        category: form.category || null,
        rarity: form.rarity || null,
        minTier: form.minTier || null,
        availableFrom: form.availableFrom || null,
        availableTo: form.availableTo || null,
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

  async function toggleEnabled(g: GiftRow) {
    const res = await fetch(`/api/admin/live-gifts/${g.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !g.enabled }),
    });
    if (res.ok) await load();
  }

  async function move(g: GiftRow, direction: -1 | 1) {
    const sorted = gifts.slice().sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((x) => x.id === g.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];

    setReordering(g.id);
    try {
      await Promise.all([
        fetch(`/api/admin/live-gifts/${g.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: other.sortOrder }),
        }),
        fetch(`/api/admin/live-gifts/${other.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: g.sortOrder }),
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
          <GiftIcon className="h-6 w-6 text-zrp-red" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("adminLiveGifts.catalogTitle")}</h1>
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
      ) : gifts.length === 0 ? (
        <p className="py-12 text-center text-gray-500 dark:text-gray-400">{t("adminLiveGifts.empty")}</p>
      ) : (
        <div className="space-y-3">
          {gifts
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((g, i, arr) => (
              <div
                key={g.id}
                className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {g.iconUrl ? (
                    <Image src={g.iconUrl} alt={g.key} width={40} height={40} className="h-10 w-10 rounded-full object-cover" unoptimized />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
                      <GiftIcon className="h-5 w-5 text-gray-400" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-gray-900 dark:text-white">{g.key}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          g.enabled
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                        }`}
                      >
                        {g.enabled ? t("adminLiveGifts.enabled") : t("adminLiveGifts.disabled")}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {g.priceCoins} {t("adminLiveGifts.colCoins").toLowerCase()}
                      {g.animationUrl ? ` · ${t("adminLiveGifts.colAnimation")} ✓` : ""}
                      {g.soundUrl ? ` · ${t("adminLiveGifts.colSoundUrl")} ✓` : ""}
                      {g.category ? ` · ${g.category}` : ""}
                      {g.rarity ? ` · ${g.rarity}` : ""}
                      {g.minTier ? ` · ${t("adminLiveGifts.colMinTier")}: ${g.minTier}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={i === 0 || reordering === g.id}
                    onClick={() => move(g, -1)}
                    aria-label={t("adminLiveGifts.colSortOrder")}
                    className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-30 dark:border-gray-700 dark:hover:bg-gray-700"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={i === arr.length - 1 || reordering === g.id}
                    onClick={() => move(g, 1)}
                    aria-label={t("adminLiveGifts.colSortOrder")}
                    className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-30 dark:border-gray-700 dark:hover:bg-gray-700"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleEnabled(g)}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    {g.enabled ? t("adminLiveGifts.disabled") : t("adminLiveGifts.enabled")}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(g)}
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
          <div
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl dark:bg-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-lg font-bold text-gray-900 dark:text-white">
              {form.id ? t("adminLiveGifts.edit") : t("adminLiveGifts.create")} {t("adminLiveGifts.colGift")}
            </h2>

            <div className="space-y-3">
              {!form.id && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{t("adminLiveGifts.colKey")}</label>
                  <input
                    type="text"
                    value={form.key}
                    onChange={(e) => setForm({ ...form, key: e.target.value })}
                    placeholder="rose, fire, crown..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                  />
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{t("adminLiveGifts.colPrice")}</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={form.priceCoins}
                  onChange={(e) => setForm({ ...form, priceCoins: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{t("adminLiveGifts.colIcon")}</label>
                <input
                  type="text"
                  value={form.iconUrl}
                  onChange={(e) => setForm({ ...form, iconUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{t("adminLiveGifts.colAnimation")}</label>
                <input
                  type="text"
                  value={form.animationUrl}
                  onChange={(e) => setForm({ ...form, animationUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{t("adminLiveGifts.colSoundUrl")}</label>
                <input
                  type="text"
                  value={form.soundUrl}
                  onChange={(e) => setForm({ ...form, soundUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{t("adminLiveGifts.colCategory")}</label>
                <input
                  type="text"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  maxLength={40}
                  placeholder="Love, Luxury, Fun..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{t("adminLiveGifts.colRarity")}</label>
                <select
                  value={form.rarity}
                  onChange={(e) => setForm({ ...form, rarity: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                >
                  <option value="">{t("adminLiveGifts.none")}</option>
                  {RARITIES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{t("adminLiveGifts.colMinTier")}</label>
                <select
                  value={form.minTier}
                  onChange={(e) => setForm({ ...form, minTier: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                >
                  <option value="">{t("adminLiveGifts.noRestriction")}</option>
                  {MIN_TIERS.map((p) => (
                    <option key={p} value={p}>
                      {p === "free"
                        ? t("adminUsers.planFree")
                        : p === "pro"
                          ? t("adminUsers.planPro")
                          : p === "business"
                            ? t("adminUsers.planBusiness")
                            : t("adminUsers.planEnterprise")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{t("adminLiveGifts.colAvailableFrom")}</label>
                  <input
                    type="datetime-local"
                    value={form.availableFrom}
                    onChange={(e) => setForm({ ...form, availableFrom: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{t("adminLiveGifts.colAvailableTo")}</label>
                  <input
                    type="datetime-local"
                    value={form.availableTo}
                    onChange={(e) => setForm({ ...form, availableTo: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                  />
                </div>
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
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                />
                {t("adminLiveGifts.enabled")}
              </label>

              {form.iconUrl && (
                <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 p-2 dark:border-gray-600">
                  <span className="text-xs text-gray-400">{t("adminLiveGifts.preview")}:</span>
                  <Image src={form.iconUrl} alt="preview" width={32} height={32} className="h-8 w-8 rounded-full object-cover" unoptimized />
                </div>
              )}
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
