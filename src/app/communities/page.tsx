"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, Users, Plus, X, Search } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

type Community = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  hashtag: string;
  iconUrl: string | null;
  memberCount: number;
  isMember: boolean;
};

const CATEGORIES = [
  "TRAVEL",
  "PHOTOGRAPHY",
  "NATURE",
  "TECHNOLOGY",
  "HEALTH_FITNESS",
  "ART_DESIGN",
  "GENERAL",
] as const;

const CATEGORY_KEY: Record<string, string> = {
  TRAVEL: "communities.category.travel",
  PHOTOGRAPHY: "communities.category.photography",
  NATURE: "communities.category.nature",
  TECHNOLOGY: "communities.category.technology",
  HEALTH_FITNESS: "communities.category.healthFitness",
  ART_DESIGN: "communities.category.artDesign",
  GENERAL: "communities.category.general",
};

export default function CommunitiesPage() {
  const { t } = useLanguage();
  const { status } = useSession();
  const router = useRouter();

  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({ name: "", description: "", category: "GENERAL", hashtag: "" });

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/communities?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCommunities(data.items || []);
    } catch {
      setError(t("communities.errorLoad"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated") load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, category]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    load();
  };

  const toggleMembership = async (community: Community) => {
    setCommunities((prev) =>
      prev.map((c) =>
        c.id === community.id
          ? { ...c, isMember: !c.isMember, memberCount: c.memberCount + (c.isMember ? -1 : 1) }
          : c
      )
    );
    try {
      const res = await fetch(`/api/communities/${community.id}/${community.isMember ? "leave" : "join"}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
    } catch {
      load(); // Reconcile with the server on failure.
      setError(community.isMember ? t("communities.errorLeave") : t("communities.errorJoin"));
    }
  };

  const createCommunity = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("communities.errorCreate"));
      setCreating(false);
      setForm({ name: "", description: "", category: "GENERAL", hashtag: "" });
      router.push(`/communities/${data.community.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("communities.errorCreate"));
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
            <div className="font-black text-lg leading-tight">{t("communities.title")}</div>
            <div className="text-xs text-gray-500 dark:text-white/50 leading-tight">{t("communities.subtitle")}</div>
          </div>

          <button
            type="button"
            onClick={() => setCreating(true)}
            className="ml-auto h-9 px-4 rounded-full bg-zrp-red text-white text-sm font-bold flex items-center gap-1.5 shrink-0"
          >
            <Plus className="w-4 h-4" /> {t("communities.createButton")}
          </button>
        </div>
      </header>

      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <form onSubmit={submitSearch} className="relative mb-4">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("communities.searchPlaceholder")}
            aria-label={t("communities.searchPlaceholder")}
            className="w-full pl-10 pr-4 py-2.5 rounded-full bg-gray-100 dark:bg-white/[0.06] border border-transparent focus:border-zrp-red/40 outline-none text-sm"
          />
        </form>

        <div className="flex gap-2 overflow-x-auto pb-1 mb-6 -mx-1 px-1">
          <button
            type="button"
            onClick={() => setCategory(null)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-semibold border ${
              category === null
                ? "bg-zrp-red text-white border-zrp-red"
                : "border-gray-300 dark:border-white/15 text-gray-700 dark:text-white/70"
            }`}
          >
            {t("communities.categoryFilter.all")}
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-semibold border ${
                category === c
                  ? "bg-zrp-red text-white border-zrp-red"
                  : "border-gray-300 dark:border-white/15 text-gray-700 dark:text-white/70"
              }`}
            >
              {t(CATEGORY_KEY[c] as any)}
            </button>
          ))}
        </div>

        {error && (
          <div role="alert" aria-live="polite" className="mb-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-3 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        {creating && (
          <div className="mb-6 rounded-2xl border border-gray-200 dark:border-white/10 p-4 space-y-3">
            <div className="font-bold">{t("communities.create.title")}</div>
            <div>
              <label htmlFor="community-name" className="text-xs font-semibold text-gray-500 dark:text-white/50">
                {t("communities.create.nameLabel")}
              </label>
              <input
                id="community-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t("communities.create.namePlaceholder")}
                className="w-full mt-1 p-2.5 rounded-xl bg-gray-100 dark:bg-white/[0.06] border border-transparent focus:border-zrp-red/40 outline-none"
              />
            </div>
            <div>
              <label htmlFor="community-description" className="text-xs font-semibold text-gray-500 dark:text-white/50">
                {t("communities.create.descriptionLabel")}
              </label>
              <textarea
                id="community-description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={t("communities.create.descriptionPlaceholder")}
                rows={3}
                className="w-full mt-1 p-2.5 rounded-xl bg-gray-100 dark:bg-white/[0.06] border border-transparent focus:border-zrp-red/40 outline-none resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="community-category" className="text-xs font-semibold text-gray-500 dark:text-white/50">
                  {t("communities.create.categoryLabel")}
                </label>
                <select
                  id="community-category"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full mt-1 p-2.5 rounded-xl bg-gray-100 dark:bg-white/[0.06] border border-transparent focus:border-zrp-red/40 outline-none"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(CATEGORY_KEY[c] as any)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="community-hashtag" className="text-xs font-semibold text-gray-500 dark:text-white/50">
                  {t("communities.create.hashtagLabel")}
                </label>
                <div className="flex items-center mt-1 rounded-xl bg-gray-100 dark:bg-white/[0.06] border border-transparent focus-within:border-zrp-red/40">
                  <span className="pl-3 text-gray-400">#</span>
                  <input
                    id="community-hashtag"
                    value={form.hashtag}
                    onChange={(e) => setForm((f) => ({ ...f, hashtag: e.target.value }))}
                    placeholder={t("communities.create.hashtagPlaceholder")}
                    className="w-full p-2.5 pl-1 bg-transparent outline-none"
                  />
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-white/40">{t("communities.create.hashtagHint")}</p>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={busy || form.name.trim().length < 3 || form.description.trim().length < 10 || !form.hashtag.trim()}
                onClick={createCommunity}
                className="h-10 px-4 rounded-full bg-zrp-red text-white font-bold disabled:opacity-40"
              >
                {busy ? t("communities.create.submitting") : t("communities.create.submit")}
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="w-10 h-10 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-center"
                aria-label={t("communities.create.cancel")}
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
        ) : !communities.length ? (
          <div className="rounded-[24px] border border-dashed border-gray-300 dark:border-white/10 py-20 text-center">
            <Users className="w-10 h-10 mx-auto text-gray-300 dark:text-white/20" />
            <div className="font-bold mt-4">{t("communities.emptyTitle")}</div>
            <div className="text-sm text-gray-500 mt-2">{t("communities.emptyBody")}</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {communities.map((c) => (
              <div key={c.id} className="rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.035] p-4 flex flex-col">
                <Link href={`/communities/${c.id}`} className="min-w-0">
                  <div className="font-bold truncate">{c.name}</div>
                  <div className="text-xs text-gray-500 dark:text-white/40 mt-0.5">{t(CATEGORY_KEY[c.category] as any)}</div>
                  <p className="text-sm text-gray-600 dark:text-white/60 mt-2 line-clamp-2">{c.description}</p>
                </Link>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-500 dark:text-white/40 shrink-0">
                    {t("communities.memberCount", { n: c.memberCount })}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleMembership(c)}
                    className={`shrink-0 h-8 px-3.5 rounded-full text-sm font-bold ${
                      c.isMember
                        ? "border border-gray-300 dark:border-white/15 text-gray-700 dark:text-white/70"
                        : "bg-zrp-red text-white"
                    }`}
                  >
                    {c.isMember ? t("communities.joined") : t("communities.join")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
