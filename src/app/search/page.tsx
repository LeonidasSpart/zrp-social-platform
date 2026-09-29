"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Search,
  Loader2,
  Users,
  FileText,
  RefreshCw,
  Hash,
  MessageSquare,
  Newspaper,
  Music2,
  Briefcase,
  ShoppingBag,
  SlidersHorizontal,
  X,
  Play,
  Pause,
} from "lucide-react";
import VerifiedBadge from "@/components/VerifiedBadge";
import PostCard from "@/components/PostCard";
import ListingCard from "@/components/ListingCard";
import OpportunityListingCard from "@/components/opportunity/ListingCard";
import { useLanguage } from "@/contexts/LanguageContext";
import { useMusicPlayer } from "@/components/music/MusicPlayerProvider";
import EmptyState from "@/components/ui/EmptyState";
import type { ListingSummary } from "@/lib/marketplace";
import type { OpportunitySummary } from "@/lib/opportunity";
import type { TranslationKey } from "@/lib/translations";

// ─── Advanced Search (Task #2) ─────────────────────────────────────
// Rebuilds the previous users/posts-only, unpaginated search page
// against the extended GET /api/search contract (src/app/api/search/
// route.ts): 8 categories, 4 sort modes, filters, and real cursor
// pagination. See docs/advanced-search-architecture.md for the full
// design. Reuses PostCard and both ListingCard components rather than
// building new result renderers for the categories that already have
// one - only People/Hashtags/Communities/News/Music get a dedicated
// (compact) row here, since no shared component exists for those.

type SearchCategory =
  | "users" | "posts" | "hashtags" | "communities" | "news" | "music" | "opportunities" | "marketplace";
type SearchSort = "relevance" | "recent" | "engagement" | "trending";
type DateRange = "any" | "24h" | "7d" | "30d" | "custom";
type MediaFilter = "" | "image" | "video" | "gif" | "poll" | "none";

const CATEGORIES: { value: SearchCategory | "all"; labelKey: TranslationKey; icon: typeof Users }[] = [
  { value: "all", labelKey: "search.allTab", icon: Search },
  { value: "users", labelKey: "search.peopleTab", icon: Users },
  { value: "posts", labelKey: "analytics.posts", icon: FileText },
  { value: "hashtags", labelKey: "search.hashtagsTab", icon: Hash },
  { value: "communities", labelKey: "nav.communities", icon: MessageSquare },
  { value: "news", labelKey: "nav.news", icon: Newspaper },
  { value: "music", labelKey: "nav.music", icon: Music2 },
  { value: "opportunities", labelKey: "nav.opportunity", icon: Briefcase },
  { value: "marketplace", labelKey: "nav.marketplace", icon: ShoppingBag },
];

const SORTS: { value: SearchSort; labelKey: TranslationKey }[] = [
  { value: "relevance", labelKey: "search.sortRelevance" },
  { value: "recent", labelKey: "search.sortRecent" },
  { value: "engagement", labelKey: "search.sortEngagement" },
  { value: "trending", labelKey: "search.sortTrending" },
];

const DATE_RANGES: { value: DateRange; labelKey: TranslationKey }[] = [
  { value: "any", labelKey: "search.dateAny" },
  { value: "24h", labelKey: "search.date24h" },
  { value: "7d", labelKey: "search.date7d" },
  { value: "30d", labelKey: "search.date30d" },
  { value: "custom", labelKey: "search.dateCustom" },
];

const MEDIA_OPTIONS: { value: MediaFilter; labelKey: TranslationKey }[] = [
  { value: "", labelKey: "search.mediaAll" },
  { value: "image", labelKey: "search.mediaImage" },
  { value: "video", labelKey: "search.mediaVideo" },
  { value: "gif", labelKey: "search.mediaGif" },
  { value: "poll", labelKey: "search.mediaPoll" },
  { value: "none", labelKey: "search.mediaNone" },
];

const COMMUNITY_CATEGORY_KEY: Record<string, TranslationKey> = {
  TRAVEL: "communities.category.travel",
  PHOTOGRAPHY: "communities.category.photography",
  NATURE: "communities.category.nature",
  TECHNOLOGY: "communities.category.technology",
  HEALTH_FITNESS: "communities.category.healthFitness",
  ART_DESIGN: "communities.category.artDesign",
  GENERAL: "communities.category.general",
};

interface Filters {
  dateRange: DateRange;
  dateFrom: string;
  dateTo: string;
  language: string;
  country: string;
  media: MediaFilter;
  verified: boolean;
  professional: boolean;
  creator: boolean;
}

const DEFAULT_FILTERS: Filters = {
  dateRange: "any",
  dateFrom: "",
  dateTo: "",
  language: "",
  country: "",
  media: "",
  verified: false,
  professional: false,
  creator: false,
};

interface UserResult {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  badgeType: string | null;
}

interface HashtagResult {
  tag: string;
  count: number;
}

interface CommunityResult {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  hashtag: string;
  iconUrl: string | null;
  memberCount: number;
}

interface NewsResult {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  coverImage: string | null;
  sourceName: string | null;
  publishedAt: string | null;
}

type MusicResult =
  | { kind: "artist"; id: string; displayName: string; avatarUrl: string | null; verified: boolean }
  | { kind: "album"; id: string; title: string; coverUrl: string | null; artist: { id: string; displayName: string } }
  | {
      kind: "track";
      id: string;
      title: string;
      audioUrl: string;
      coverUrl: string | null;
      durationSec: number | null;
      artist: { id: string; displayName: string; avatarUrl: string | null };
      playCount: number;
    }
  | { kind: "playlist"; id: string; name: string; coverUrl: string | null };

interface AllModeResults {
  users: UserResult[];
  posts: any[];
  hashtags: HashtagResult[];
  communities: CommunityResult[];
  news: NewsResult[];
  music: MusicResult[];
  opportunities: OpportunitySummary[];
  marketplace: ListingSummary[];
}

function buildQueryParams(query: string, category: string, sort: SearchSort, filters: Filters, cursor: string | null) {
  const params = new URLSearchParams();
  params.set("q", query);
  params.set("type", category);
  params.set("sort", sort);
  if (filters.dateRange !== "any") params.set("dateRange", filters.dateRange);
  if (filters.dateRange === "custom") {
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
  }
  if (filters.language.trim()) params.set("language", filters.language.trim());
  if (filters.country.trim()) params.set("country", filters.country.trim());
  if (filters.media) params.set("media", filters.media);
  if (filters.verified) params.set("verified", "true");
  if (filters.professional) params.set("professional", "true");
  if (filters.creator) params.set("creator", "true");
  if (cursor) params.set("cursor", cursor);
  return params;
}

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const query = searchParams.get("q") || "";
  const category = (searchParams.get("type") as SearchCategory | "all") || "all";

  const [sort, setSort] = useState<SearchSort>("relevance");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  const [allResults, setAllResults] = useState<AllModeResults | null>(null);
  const [singleResults, setSingleResults] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  const setCategory = useCallback(
    (next: SearchCategory | "all") => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "all") params.delete("type");
      else params.set("type", next);
      router.push(`/search?${params.toString()}`);
    },
    [router, searchParams]
  );

  const filtersActive =
    filters.dateRange !== "any" ||
    !!filters.language ||
    !!filters.country ||
    !!filters.media ||
    filters.verified ||
    filters.professional ||
    filters.creator;

  useEffect(() => {
    if (query.trim().length < 2) {
      setAllResults(null);
      setSingleResults([]);
      setNextCursor(null);
      setError(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(false);
      try {
        const params = buildQueryParams(query, category, sort, filters, null);
        const res = await fetch(`/api/search?${params.toString()}`, { signal: controller.signal });
        if (!res.ok) {
          setError(true);
          return;
        }
        const data = await res.json();
        if (category === "all") {
          setAllResults(data as AllModeResults);
          setSingleResults([]);
          setNextCursor(null);
        } else {
          setAllResults(null);
          setSingleResults(data.results || []);
          setNextCursor(data.nextCursor ?? null);
        }
      } catch (err) {
        if ((err as { name?: string }).name !== "AbortError") {
          console.error("Search error:", err);
          setError(true);
        }
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, category, sort, filters, retryTick]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore || category === "all") return;
    setLoadingMore(true);
    try {
      const params = buildQueryParams(query, category, sort, filters, nextCursor);
      const res = await fetch(`/api/search?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      setSingleResults((prev) => [...prev, ...(data.results || [])]);
      setNextCursor(data.nextCursor ?? null);
    } catch (err) {
      console.error("Search load-more error:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  const hasResults = useMemo(() => {
    if (category === "all") {
      if (!allResults) return false;
      return (
        allResults.users.length +
          allResults.posts.length +
          allResults.hashtags.length +
          allResults.communities.length +
          allResults.news.length +
          allResults.music.length +
          allResults.opportunities.length +
          allResults.marketplace.length >
        0
      );
    }
    return singleResults.length > 0;
  }, [category, allResults, singleResults]);

  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      <h1 className="sr-only">{t("nav.search")}</h1>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" aria-hidden="true" />
        <input
          type="text"
          placeholder={t("search.placeholder")}
          aria-label={t("search.placeholder")}
          value={query}
          onChange={(e) => {
            const params = new URLSearchParams(searchParams.toString());
            if (e.target.value) params.set("q", e.target.value);
            else params.delete("q");
            router.push(`/search?${params.toString()}`);
          }}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-zrp-red focus:border-transparent"
          autoFocus
        />
      </div>

      {query.trim().length >= 2 && (
        <>
          {/* ─── Category tabs ─── */}
          <div className="flex gap-1.5 overflow-x-auto mt-4 pb-1 -mx-1 px-1 scrollbar-none">
            {CATEGORIES.map((c) => {
              const Icon = c.icon;
              const active = category === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium border transition ${
                    active
                      ? "bg-zrp-red text-white border-zrp-red"
                      : "border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-zrp-red/50"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  {t(c.labelKey)}
                </button>
              );
            })}
          </div>

          {/* ─── Sort + filters toggle ─── */}
          <div className="flex items-center gap-2 mt-3">
            <label htmlFor="search-sort" className="sr-only">
              {t("search.sort")}
            </label>
            <select
              id="search-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as SearchSort)}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded-full px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {t(s.labelKey)}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
              className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border transition ${
                filtersActive
                  ? "border-zrp-red text-zrp-red bg-zrp-red/5"
                  : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
              {t("search.filters")}
            </button>

            {filtersActive && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-zrp-red"
              >
                <X className="w-3 h-3" aria-hidden="true" />
                {t("search.clearFilters")}
              </button>
            )}
          </div>

          {showFilters && (
            <div className="mt-3 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-white/[0.03] space-y-3">
              <div>
                <label htmlFor="search-daterange" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                  {t("search.dateRange")}
                </label>
                <select
                  id="search-daterange"
                  value={filters.dateRange}
                  onChange={(e) => setFilters((f) => ({ ...f, dateRange: e.target.value as DateRange }))}
                  className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                >
                  {DATE_RANGES.map((d) => (
                    <option key={d.value} value={d.value}>
                      {t(d.labelKey)}
                    </option>
                  ))}
                </select>
              </div>

              {filters.dateRange === "custom" && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="search-date-from" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                      {t("search.dateFrom")}
                    </label>
                    <input
                      id="search-date-from"
                      type="date"
                      value={filters.dateFrom}
                      onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                      className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                    />
                  </div>
                  <div>
                    <label htmlFor="search-date-to" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                      {t("search.dateTo")}
                    </label>
                    <input
                      id="search-date-to"
                      type="date"
                      value={filters.dateTo}
                      onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                      className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                    />
                  </div>
                </div>
              )}

              {(category === "posts" || category === "all") && (
                <div>
                  <label htmlFor="search-media" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                    {t("search.media")}
                  </label>
                  <select
                    id="search-media"
                    value={filters.media}
                    onChange={(e) => setFilters((f) => ({ ...f, media: e.target.value as MediaFilter }))}
                    className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                  >
                    {MEDIA_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {t(m.labelKey)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="search-language" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                    {t("nav.language")}
                  </label>
                  <input
                    id="search-language"
                    type="text"
                    placeholder="en, fr, de..."
                    value={filters.language}
                    onChange={(e) => setFilters((f) => ({ ...f, language: e.target.value }))}
                    className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                  />
                </div>
                <div>
                  <label htmlFor="search-country" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                    {t("settings.country")}
                  </label>
                  <input
                    id="search-country"
                    type="text"
                    placeholder="CH, FR, US..."
                    value={filters.country}
                    onChange={(e) => setFilters((f) => ({ ...f, country: e.target.value }))}
                    className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-1">
                {(
                  [
                    ["verified", "search.verified"],
                    ["professional", "search.professional"],
                    ["creator", "search.creator"],
                  ] as const
                ).map(([key, labelKey]) => (
                  <label key={key} className="inline-flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-200">
                    <input
                      type="checkbox"
                      checked={filters[key]}
                      onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.checked }))}
                      className="rounded border-gray-300 dark:border-gray-600 text-zrp-red focus:ring-zrp-red"
                    />
                    {t(labelKey)}
                  </label>
                ))}
              </div>
            </div>
          )}

          {loading && (
            <div className="flex justify-center py-8" aria-busy="true">
              <Loader2 className="w-6 h-6 animate-spin text-zrp-red" aria-hidden="true" />
            </div>
          )}

          {!loading && error && (
            <div role="alert" className="mt-4 rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 text-center">
              <p className="text-red-700 dark:text-red-400 font-semibold">{t("feed.tryAgain")}</p>
              <button
                onClick={() => setRetryTick((n) => n + 1)}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300 text-sm font-semibold"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                {t("feed.retry")}
              </button>
            </div>
          )}

          {!loading && !error && !hasResults && (
            <EmptyState icon={emptyIconFor(category)} title={emptyTitleFor(category, t)} className="mt-4" />
          )}

          {!loading && !error && hasResults && category === "all" && allResults && (
            <AllModeSections results={allResults} setCategory={setCategory} t={t} />
          )}

          {!loading && !error && hasResults && category !== "all" && (
            <div className="mt-4">
              <SingleCategoryResults category={category} results={singleResults} t={t} />
              {nextCursor && (
                <div className="flex justify-center py-4">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    aria-busy={loadingMore}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:border-zrp-red hover:text-zrp-red disabled:opacity-50"
                  >
                    {loadingMore && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                    {t("feed.loadMore")}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function emptyIconFor(category: SearchCategory | "all") {
  switch (category) {
    case "users":
      return Users;
    case "hashtags":
      return Hash;
    case "communities":
      return MessageSquare;
    case "news":
      return Newspaper;
    case "music":
      return Music2;
    case "opportunities":
      return Briefcase;
    case "marketplace":
      return ShoppingBag;
    default:
      return FileText;
  }
}

function emptyTitleFor(category: SearchCategory | "all", t: (k: TranslationKey) => string) {
  switch (category) {
    case "users":
      return t("search.noUsers");
    case "hashtags":
      return t("search.noHashtags");
    case "communities":
      return t("search.noCommunities");
    case "news":
      return t("search.noNews");
    case "music":
      return t("search.noMusic");
    case "opportunities":
      return t("search.noOpportunities");
    case "marketplace":
      return t("search.noMarketplace");
    default:
      return t("search.noPosts");
  }
}

function UserRow({ user }: { user: UserResult }) {
  return (
    <Link
      href={`/profile/${user.username}`}
      className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition"
    >
      <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0">
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt={user.name || user.username} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold">
            {(user.name || user.username)[0].toUpperCase()}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="font-semibold text-gray-900 dark:text-white truncate">{user.name || user.username}</span>
          {user.badgeType && <VerifiedBadge badgeType={user.badgeType} />}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
          <bdi>@{user.username}</bdi>
        </p>
      </div>
    </Link>
  );
}

function HashtagRow({ hashtag, t }: { hashtag: HashtagResult; t: (k: TranslationKey, vars?: Record<string, string>) => string }) {
  return (
    <Link
      href={`/hashtag/${encodeURIComponent(hashtag.tag)}`}
      className="flex items-center justify-between gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-9 h-9 rounded-full bg-zrp-red/10 text-zrp-red flex items-center justify-center flex-shrink-0">
          <Hash className="w-4 h-4" aria-hidden="true" />
        </span>
        <span className="font-semibold text-gray-900 dark:text-white truncate">#{hashtag.tag}</span>
      </div>
      <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{hashtag.count}</span>
    </Link>
  );
}

function CommunityRow({ community, t }: { community: CommunityResult; t: (k: TranslationKey, vars?: Record<string, string>) => string }) {
  return (
    <Link
      href={`/communities/${community.id}`}
      className="block p-3 rounded-xl border border-gray-200 dark:border-white/10 hover:border-zrp-red/50 transition"
    >
      <div className="font-semibold text-gray-900 dark:text-white truncate">{community.name}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
        {t((COMMUNITY_CATEGORY_KEY[community.category] || "communities.category.general") as TranslationKey)}
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-300 mt-1.5 line-clamp-2">{community.description}</p>
      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {t(community.memberCount === 1 ? "communities.memberCountOne" : "communities.memberCountOther", {
          n: String(community.memberCount),
        })}
      </div>
    </Link>
  );
}

function NewsRow({ article }: { article: NewsResult }) {
  return (
    <Link
      href={`/news/${article.slug}`}
      className="flex gap-3 p-3 rounded-xl border border-gray-200 dark:border-white/10 hover:border-zrp-red/50 transition"
    >
      <div className="w-16 h-16 rounded-lg bg-gray-100 dark:bg-gray-800 overflow-hidden flex-shrink-0">
        {article.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={article.coverImage} alt={article.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <Newspaper className="w-5 h-5" aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="font-semibold text-gray-900 dark:text-white line-clamp-2">{article.title}</div>
        {article.sourceName && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{article.sourceName}</div>}
      </div>
    </Link>
  );
}

function MusicRow({ item }: { item: MusicResult }) {
  const { current, playing, play, pause } = useMusicPlayer();

  if (item.kind === "artist") {
    return (
      <Link
        href={`/music/artists/${item.id}`}
        className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition"
      >
        <div className="w-11 h-11 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0">
          {item.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.avatarUrl} alt={item.displayName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold">
              {item.displayName[0]?.toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="font-semibold text-gray-900 dark:text-white truncate">{item.displayName}</span>
            {item.verified && <VerifiedBadge badgeType="verified" />}
          </div>
        </div>
      </Link>
    );
  }

  if (item.kind === "album") {
    return (
      <Link
        href={`/music/albums/${item.id}`}
        className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition"
      >
        <div className="w-11 h-11 rounded-lg bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0">
          {item.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.coverUrl} alt={item.title} className="w-full h-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-gray-900 dark:text-white truncate">{item.title}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{item.artist.displayName}</div>
        </div>
      </Link>
    );
  }

  if (item.kind === "playlist") {
    return (
      <Link
        href={`/music/playlists/${item.id}`}
        className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition"
      >
        <div className="w-11 h-11 rounded-lg bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0">
          {item.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.coverUrl} alt={item.name} className="w-full h-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-gray-900 dark:text-white truncate">{item.name}</div>
        </div>
      </Link>
    );
  }

  // track
  const isCurrent = current?.id === item.id;
  return (
    <div className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition">
      <button
        type="button"
        onClick={() => (isCurrent && playing ? pause() : play(item))}
        aria-label={item.title}
        className="w-11 h-11 rounded-lg bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0 relative flex items-center justify-center"
      >
        {item.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.coverUrl} alt={item.title} className="absolute inset-0 w-full h-full object-cover" />
        )}
        <span className="relative z-10 text-white bg-black/40 rounded-full p-1">
          {isCurrent && playing ? <Pause className="w-3.5 h-3.5" aria-hidden="true" /> : <Play className="w-3.5 h-3.5" aria-hidden="true" />}
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <div className={`font-semibold truncate ${isCurrent ? "text-zrp-red" : "text-gray-900 dark:text-white"}`}>{item.title}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{item.artist.displayName}</div>
      </div>
    </div>
  );
}

function SingleCategoryResults({
  category,
  results,
  t,
}: {
  category: SearchCategory;
  results: any[];
  t: (k: TranslationKey, vars?: Record<string, string>) => string;
}) {
  switch (category) {
    case "users":
      return (
        <div className="space-y-1">
          {results.map((u: UserResult) => (
            <UserRow key={u.id} user={u} />
          ))}
        </div>
      );
    case "posts":
      return (
        <div>
          {results.map((p) => (
            <PostCard key={p.id} post={p} onUpdate={() => {}} />
          ))}
        </div>
      );
    case "hashtags":
      return (
        <div className="space-y-1">
          {results.map((h: HashtagResult) => (
            <HashtagRow key={h.tag} hashtag={h} t={t} />
          ))}
        </div>
      );
    case "communities":
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {results.map((c: CommunityResult) => (
            <CommunityRow key={c.id} community={c} t={t} />
          ))}
        </div>
      );
    case "news":
      return (
        <div className="space-y-2">
          {results.map((a: NewsResult) => (
            <NewsRow key={a.id} article={a} />
          ))}
        </div>
      );
    case "music":
      return (
        <div className="space-y-1">
          {results.map((m: MusicResult) => (
            <MusicRow key={`${m.kind}:${m.id}`} item={m} />
          ))}
        </div>
      );
    case "opportunities":
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {results.map((o: OpportunitySummary) => (
            <OpportunityListingCard key={o.id} listing={o} />
          ))}
        </div>
      );
    case "marketplace":
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {results.map((l: ListingSummary) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
      );
    default:
      return null;
  }
}

function AllModeSections({
  results,
  setCategory,
  t,
}: {
  results: AllModeResults;
  setCategory: (c: SearchCategory | "all") => void;
  t: (k: TranslationKey, vars?: Record<string, string>) => string;
}) {
  const sections: { key: SearchCategory; labelKey: TranslationKey; items: any[] }[] = [
    { key: "users", labelKey: "search.usersTab", items: results.users },
    { key: "posts", labelKey: "search.postsTab", items: results.posts },
    { key: "hashtags", labelKey: "search.hashtagsTab", items: results.hashtags },
    { key: "communities", labelKey: "nav.communities", items: results.communities },
    { key: "news", labelKey: "nav.news", items: results.news },
    { key: "music", labelKey: "nav.music", items: results.music },
    { key: "opportunities", labelKey: "nav.opportunity", items: results.opportunities },
    { key: "marketplace", labelKey: "nav.marketplace", items: results.marketplace },
  ];

  return (
    <div className="mt-4 space-y-6">
      {sections
        .filter((s) => s.items.length > 0)
        .map((s) => (
          <section key={s.key}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                {t(s.labelKey, { n: String(s.items.length) })}
              </h2>
              <button
                type="button"
                onClick={() => setCategory(s.key)}
                className="text-xs font-semibold text-zrp-red hover:underline"
              >
                {t("search.seeAll")}
              </button>
            </div>
            {s.key === "posts" ? (
              <div>
                {s.items.slice(0, 3).map((p) => (
                  <PostCard key={p.id} post={p} onUpdate={() => {}} />
                ))}
              </div>
            ) : (
              <SingleCategoryResults category={s.key} results={s.items} t={t} />
            )}
          </section>
        ))}
    </div>
  );
}
