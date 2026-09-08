"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
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
  const pathname = usePathname();
  const { t } = useLanguage();

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
      .then((data) => setSuggestions(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoadingSuggestions(false));
  }, [session]);

  const handleFollow = async (userId: string, username: string) => {
    setFollowLoading(userId);

    try {
      const res = await fetch(`/api/users/${username}/follow`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "follow",
        }),
      });

      if (res.ok) {
        setFollowingIds((prev) => {
          const next = new Set(prev);
          next.add(userId);
          return next;
        });
      }
    } catch (error) {
      console.error("Follow error:", error);
    } finally {
      setFollowLoading(null);
    }
  };

  // Suppressed on focused surfaces as well as the immersive ones.
  //
  // Trending, Who-to-follow and a second search field are discovery
  // aids for a browsing context. On Settings they turned the page into
  // four columns where the fourth was irrelevant to the task; on
  // Messages they competed with a conversation that wants the width.
  // Both are surfaces someone is on to finish something, not to browse.
  //
  // Nothing is removed from the product: search lives in the header at
  // lg and above and as its own /search destination in both the sidebar
  // and the bottom nav, and Explore covers trending and suggestions.
  const FOCUSED_SURFACES = ["/admin", "/onboarding", "/shorts", "/settings", "/messages"];

  if (!session || FOCUSED_SURFACES.some((path) => pathname?.startsWith(path))) {
    return null;
  }

  return (
    <aside
      className="
        hidden xl:flex
        flex-col
        w-80
        flex-shrink-0
        h-[100dvh]
        sticky
        top-0
        py-4
        pl-4
        overflow-y-auto
        overscroll-contain
        scrollbar-hide
      "
    >
      {/* The rail's own search field is gone: the header now carries
          one at lg and above, so from 1280px up (where this rail
          appears) the two sat on screen together showing the same
          placeholder and doing the same thing. The header's is the one
          that survives, because it is also present on Settings,
          Messages, Shorts, Admin and Onboarding - the surfaces this
          rail deliberately hides on. Nothing is lost: same /search
          route, still a destination in the sidebar and bottom nav. */}

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
          <p className="text-sm text-gray-400 px-4 pb-4">
            {t("rightPanel.noTrending")}
          </p>
        ) : (
          <div className="pb-2 max-h-[280px] overflow-y-auto overscroll-contain scrollbar-hide">
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
                  {t("rightPanel.postsCount", {
                    n: item.count,
                  })}
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
          <p className="text-sm text-gray-400 px-4 pb-4">
            {t("rightPanel.noSuggestions")}
          </p>
        ) : (
          <div className="pb-2 max-h-[340px] overflow-y-auto overscroll-contain scrollbar-hide">
            {suggestions.map((user) => {
              const alreadyFollowing = followingIds.has(user.id);

              return (
                <div
                  key={user.id}
                  className="flex items-center gap-3 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                >
                  <Link
                    href={`/profile/${user.username}`}
                    className="flex-shrink-0"
                  >
                    <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold text-sm">
                          {(user.name || user.username)[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                  </Link>

                  <Link
                    href={`/profile/${user.username}`}
                    className="flex-1 min-w-0"
                  >
                    <div className="flex items-center gap-1">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {user.name || user.username}
                      </p>

                      {user.badgeType && (
                        <VerifiedBadge badgeType={user.badgeType} />
                      )}
                    </div>

                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      @{user.username}
                    </p>
                  </Link>

                  <button
                    type="button"
                    onClick={() =>
                      handleFollow(user.id, user.username)
                    }
                    disabled={
                      alreadyFollowing ||
                      followLoading === user.id
                    }
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
