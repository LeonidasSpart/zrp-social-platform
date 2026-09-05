"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import VerifiedBadge from "./VerifiedBadge";
import { useLanguage } from "@/contexts/LanguageContext";

interface SuggestedUser {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  badgeType: string | null;
}

// A "For You" discovery module - same real data source
// (/api/users/suggested) RightPanel already uses on desktop, just
// reformatted as a compact horizontal row so mobile/tablet feeds (where
// RightPanel is hidden) get the same discovery surface. Renders nothing
// once loaded if there's nothing to suggest, rather than an empty card.
export default function HomeCreatorsRow() {
  const { t } = useLanguage();
  const [suggestions, setSuggestions] = useState<SuggestedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [followLoading, setFollowLoading] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/users/suggested")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) setSuggestions(Array.isArray(data) ? data : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
    } catch {
      // no-op - button just stays in its current state
    } finally {
      setFollowLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-zrp-deepBlack px-4 py-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-zrp-red" />
        </div>
      </div>
    );
  }

  if (suggestions.length === 0) return null;

  return (
    <div className="bg-white dark:bg-zrp-deepBlack px-4 py-4 border-b border-gray-200 dark:border-gray-800">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-gray-900 dark:text-white">
          {t("rightPanel.whoToFollow")}
        </h2>

        <Link
          href="/explore"
          className="text-xs font-semibold text-zrp-red hover:underline"
        >
          {t("home.seeAll")}
        </Link>
      </div>

      <div className="flex gap-4 overflow-x-auto scrollbar-hide -mx-4 px-4">
        {suggestions.map((user) => {
          const alreadyFollowing = followingIds.has(user.id);

          return (
            <div
              key={user.id}
              className="flex-shrink-0 w-28 flex flex-col items-center text-center"
            >
              <Link href={`/profile/${user.username}`} className="flex-shrink-0">
                <div className="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden ring-1 ring-gray-200 dark:ring-gray-700">
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold text-lg">
                      {(user.name || user.username)[0].toUpperCase()}
                    </div>
                  )}
                </div>
              </Link>

              <Link
                href={`/profile/${user.username}`}
                className="mt-2 flex items-center gap-0.5 max-w-full"
              >
                <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {user.name || user.username}
                </span>
                {user.badgeType && <VerifiedBadge badgeType={user.badgeType} />}
              </Link>

              <span className="text-xs text-gray-500 dark:text-gray-400 truncate w-full">
                @{user.username}
              </span>

              <button
                type="button"
                onClick={() => handleFollow(user.id, user.username)}
                disabled={alreadyFollowing || followLoading === user.id}
                className={`mt-2 w-full px-2 py-1.5 rounded-full text-xs font-semibold transition ${
                  alreadyFollowing
                    ? "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                    : "bg-zrp-red text-white hover:bg-zrp-darkRed"
                } disabled:opacity-50`}
              >
                {followLoading === user.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" />
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
    </div>
  );
}
