"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Search, Loader2 } from "lucide-react";
import VerifiedBadge from "./VerifiedBadge";
import { useLanguage } from "@/contexts/LanguageContext";

interface TrendingTag {
  tag: string;
  count: number;
}

interface SuggestedUser {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  badgeType: string | null;
}

export default function RightPanel() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [trending, setTrending] = useState<TrendingTag[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestedUser[]>([]);
  const [loadingTrending, setLoadingTrending] = useState(true);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [followLoading, setFollowLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;

    fetch("/api/hashtags/trending")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setTrending(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoadingTrending(false));

    fetch("/api/users/suggested")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setSuggestions(Array.isArray(data) ? data.slice(0, 5) : []))
      .catch(() => {})
      .finally(() => setLoadingSuggestions(false));
  }, [session]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  const handleFollow = async (userId: string, username: string) => {
    setFollowLoading(userId);
    try {
      const res = await fetch(`/api/users/${username}/follow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "follow" }),
      });
      if (res.ok) {
        setFollowingIds((prev) => new Set(prev).add(userId));
      }
    } catch (error) {
      console.error("Follow error:", error);
    } finally {
      setFollowLoading(null);
    }
  };

  if (!session || pathname?.startsWith("/admin") || pathname?.startsWith("/onboarding")) return null;

  return (
    <aside className="hidden xl:flex flex-col w-80 flex-shrink-0 h-screen sticky top-0 py-4 pl-4 overflow-y-auto">
      {/* ─── Search ─────────────────────────────────────────────── */}
      <form onSubmit={handleSearch} className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("rightPanel.searchPlaceholder")}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-100 dark:bg-gray-800 border border-transparent focus:border-zrp-red focus:bg-white dark:focus:bg-gray-900 rounded-full text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red transition"
          />
        </div>
      </form>

      {/* ─── Trending ───────────────────────────────────────────── */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl mb-4 overflow-hidden">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white px-4 pt-3 pb-2">
          {t("rightPanel.trending")}
        </h2>
        {loadingTrending ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-zrp-red" />
          </div>
        ) : trending.length === 0 ? (
          <p className="text-sm text-gray-400 px-4 pb-4">{t("rightPanel.noTrending")}</p>
        ) : (
          <div className="pb-2">
            {trending.map((item) => (
              <Link
                key={item.tag}
                href={`/hashtag/${item.tag}`}
                className="block px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              >
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  #{item.tag}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t("rightPanel.postsCount", { n: item.count })}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ─── Who to follow ──────────────────────────────────────── */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl mb-4 overflow-hidden">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white px-4 pt-3 pb-2">
          {t("rightPanel.whoToFollow")}
        </h2>
        {loadingSuggestions ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-zrp-red" />
          </div>
        ) : suggestions.length === 0 ? (
          <p className="text-sm text-gray-400 px-4 pb-4">{t("rightPanel.noSuggestions")}</p>
        ) : (
          <div className="pb-2">
            {suggestions.map((user) => {
              const alreadyFollowing = followingIds.has(user.id);
              return (
                <div
                  key={user.id}
                  className="flex items-center gap-3 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                >
                  <Link href={`/profile/${user.username}`} className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold text-sm">
                          {(user.name || user.username)[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                  </Link>
                  <Link href={`/profile/${user.username}`} className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {user.name || user.username}
                      </p>
                      {user.badgeType && <VerifiedBadge badgeType={user.badgeType} />}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      @{user.username}
                    </p>
                  </Link>
                  <button
                    onClick={() => handleFollow(user.id, user.username)}
                    disabled={alreadyFollowing || followLoading === user.id}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                      alreadyFollowing
                        ? "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                        : "bg-zrp-red text-white hover:bg-zrp-darkRed"
                    } disabled:opacity-50`}
                  >
                    {followLoading === user.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : alreadyFollowing ? (
                      t("action.following")
                    ) : (
                      t("action.follow")
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Footer ─────────────────────────────────────────────── */}
      <div className="px-4 py-2 text-xs text-gray-400 dark:text-gray-500">
        <p>{t("rightPanel.footerText")}</p>
      </div>
    </aside>
  );
}
