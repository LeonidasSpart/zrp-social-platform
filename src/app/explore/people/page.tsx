"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Users } from "lucide-react";
import VerifiedBadge from "@/components/VerifiedBadge";
import { useLanguage } from "@/contexts/LanguageContext";

export const dynamic = "force-dynamic";

interface SuggestedUser {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  badgeType: string | null;
}

// Full "Who to follow" discovery page - the "See all" destination for
// HomeCreatorsRow. Same real data source (/api/users/suggested), just
// requesting the full available list instead of the compact Home teaser's
// slice, and rendered as a full-width scannable list instead of a row.
export default function PeopleDiscoveryPage() {
  const { status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();
  const [users, setUsers] = useState<SuggestedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [followLoading, setFollowLoading] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;

    fetch("/api/users/suggested?limit=50")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) setUsers(Array.isArray(data) ? data : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [status]);

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

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        {t("action.loading")}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-gray-500 hover:text-gray-700 -m-2 p-2">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Users className="w-6 h-6 text-zrp-red" />
          {t("rightPanel.whoToFollow")}
        </h1>
      </div>

      {users.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <Users className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
          <p>{t("onboarding.noSuggestions")}</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-200 dark:divide-gray-800">
          {users.map((user) => {
            const alreadyFollowing = followingIds.has(user.id);

            return (
              <div key={user.id} className="flex items-center gap-3 py-4">
                <Link href={`/profile/${user.username}`} className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden ring-1 ring-gray-200 dark:ring-gray-700">
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
                  className="flex-1 min-w-0"
                >
                  <div className="flex items-center gap-1">
                    <span className="font-semibold text-gray-900 dark:text-white truncate">
                      {user.name || user.username}
                    </span>
                    {user.badgeType && <VerifiedBadge badgeType={user.badgeType} />}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                    @{user.username}
                  </p>
                </Link>

                <button
                  type="button"
                  onClick={() => handleFollow(user.id, user.username)}
                  disabled={alreadyFollowing || followLoading === user.id}
                  className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition ${
                    alreadyFollowing
                      ? "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                      : "bg-zrp-red text-white hover:bg-zrp-darkRed"
                  } disabled:opacity-50`}
                >
                  {followLoading === user.id ? (
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
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
  );
}
