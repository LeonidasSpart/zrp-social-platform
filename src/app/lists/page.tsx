"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, ListChecks, Plus, X, Lock } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

type ListSummary = {
  id: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  memberCount: number;
};

export default function ListsPage() {
  const { t } = useLanguage();
  const { status } = useSession();
  const router = useRouter();

  const [lists, setLists] = useState<ListSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", isPrivate: false });

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lists", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLists(data.items || []);
    } catch {
      setError(t("lists.errorLoad"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated") load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const createList = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("lists.errorCreate"));
      setCreating(false);
      setForm({ name: "", description: "", isPrivate: false });
      router.push(`/lists/${data.list.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("lists.errorCreate"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#050505] text-gray-950 dark:text-white pb-32">
      <header className="sticky top-0 z-30 border-b border-gray-200/70 dark:border-white/10 bg-white/85 dark:bg-[#050505]/85 backdrop-blur-2xl">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/10" aria-label={t("action.cancel")}>
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="font-black text-lg leading-tight">{t("lists.title")}</div>
            <div className="text-xs text-gray-500 dark:text-white/50 leading-tight">{t("lists.subtitle")}</div>
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="ml-auto h-9 px-4 rounded-full bg-zrp-red text-white text-sm font-bold flex items-center gap-1.5 shrink-0"
          >
            <Plus className="w-4 h-4" /> {t("lists.createButton")}
          </button>
        </div>
      </header>

      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {error && (
          <div role="alert" aria-live="polite" className="mb-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-3 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        {creating && (
          <div className="mb-6 rounded-2xl border border-gray-200 dark:border-white/10 p-4 space-y-3">
            <div className="font-bold">{t("lists.create.title")}</div>
            <div>
              <label htmlFor="list-name" className="text-xs font-semibold text-gray-500 dark:text-white/50">
                {t("lists.create.nameLabel")}
              </label>
              <input
                id="list-name"
                autoFocus
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t("lists.create.namePlaceholder")}
                className="w-full mt-1 p-2.5 rounded-xl bg-gray-100 dark:bg-white/[0.06] border border-transparent focus:border-zrp-red/40 outline-none"
              />
            </div>
            <div>
              <label htmlFor="list-description" className="text-xs font-semibold text-gray-500 dark:text-white/50">
                {t("lists.create.descriptionLabel")}
              </label>
              <textarea
                id="list-description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={t("lists.create.descriptionPlaceholder")}
                rows={2}
                className="w-full mt-1 p-2.5 rounded-xl bg-gray-100 dark:bg-white/[0.06] border border-transparent focus:border-zrp-red/40 outline-none resize-none"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isPrivate}
                onChange={(e) => setForm((f) => ({ ...f, isPrivate: e.target.checked }))}
                className="rounded"
              />
              {t("lists.create.privateLabel")}
            </label>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={busy || !form.name.trim()}
                onClick={createList}
                className="h-10 px-4 rounded-full bg-zrp-red text-white font-bold disabled:opacity-40"
              >
                {busy ? t("lists.create.submitting") : t("lists.create.submit")}
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="w-10 h-10 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-center"
                aria-label={t("lists.create.cancel")}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-16 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-zrp-red border-t-transparent" />
          </div>
        ) : !lists.length ? (
          <div className="rounded-[24px] border border-dashed border-gray-300 dark:border-white/10 py-20 text-center">
            <ListChecks className="w-10 h-10 mx-auto text-gray-300 dark:text-white/20" />
            <div className="font-bold mt-4">{t("lists.emptyTitle")}</div>
            <div className="text-sm text-gray-500 mt-2">{t("lists.emptyBody")}</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {lists.map((l) => (
              <Link
                key={l.id}
                href={`/lists/${l.id}`}
                className="rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.035] p-4 hover:border-zrp-red/30 transition"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-bold truncate">{l.name}</span>
                  {l.isPrivate && <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                </div>
                {l.description && <p className="text-sm text-gray-600 dark:text-white/60 mt-1.5 line-clamp-2">{l.description}</p>}
                <div className="text-xs text-gray-500 dark:text-white/40 mt-3">
                  {t("communities.memberCount", { n: l.memberCount })}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
