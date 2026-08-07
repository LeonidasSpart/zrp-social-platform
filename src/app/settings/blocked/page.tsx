"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Loader2, Ban, Calendar } from "lucide-react";
import VerifiedBadge from "@/components/VerifiedBadge";
import { useLanguage } from "@/contexts/LanguageContext";

interface BlockedUser {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  badgeType: string | null;
  bio: string | null;
  blockedAt: string;
  _count: {
    followers: number;
    following: number;
  };
}

export default function BlockedUsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t, language } = useLanguage();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblocking, setUnblocking] = useState<string | null>(null);

  const localeMap: Record<string, string> = { en: "en-US", fr: "fr-FR", de: "de-DE", it: "it-IT" };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  const fetchBlockedUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users/blocked");
      if (res.ok) {
        const data = await res.json();
        setBlockedUsers(data);
      } else {
        console.error("Failed to fetch blocked users");
      }
    } catch (error) {
      console.error("Error fetching blocked users:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated") {
      fetchBlockedUsers();
    }
  }, [status]);

  const handleUnblock = async (userId: string) => {
    setUnblocking(userId);
    try {
      // Find the username to unblock
      const user = blockedUsers.find((u) => u.id === userId);
      if (!user) return;

      const res = await fetch(`/api/users/${user.username}/block`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        setBlockedUsers((prev) => prev.filter((u) => u.id !== userId));
      } else {
        const err = await res.json();
        alert(err.error || t("blocked.errUnblock"));
      }
    } catch (error) {
      console.error("Unblock error:", error);
      alert(t("blocked.errUnblock"));
    } finally {
      setUnblocking(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-zrp-red" />
          <p className="text-gray-500 dark:text-gray-400">{t("blocked.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 bg-white dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/settings"
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </Link>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          {t("blocked.title")}
        </h1>
        <span className="text-sm text-gray-500 dark:text-gray-400 ml-auto">
          {t("blocked.count", { n: blockedUsers.length })}
        </span>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        {t("blocked.explanation")}
      </p>

      {blockedUsers.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
            <Ban className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {t("blocked.emptyTitle")}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("blocked.emptyDesc")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {blockedUsers.map((user) => (
            <div
              key={user.id}
              className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition group"
            >
              {/* Avatar */}
              <Link href={`/profile/${user.username}`} className="flex-shrink-0">
                <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <img
                    src={user.avatarUrl || "/default-avatar.png"}
                    alt={user.name || user.username}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/default-avatar.png";
                    }}
                  />
                </div>
              </Link>

              {/* User info */}
              <div className="flex-1 min-w-0">
                <Link href={`/profile/${user.username}`} className="hover:underline">
                  <div className="flex items-center gap-1">
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {user.name || user.username}
                    </span>
                    {user.badgeType && <VerifiedBadge badgeType={user.badgeType} />}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    @{user.username}
                  </p>
                </Link>
                {user.bio && (
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5 line-clamp-1">
                    {user.bio}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 dark:text-gray-500">
                  <span>{t("blocked.followers", { n: user._count.followers })}</span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {t("blocked.blockedOn", { date: new Date(user.blockedAt).toLocaleDateString(localeMap[language] || "en-US") })}
                  </span>
                </div>
              </div>

              {/* Unblock button */}
              <button
                onClick={() => handleUnblock(user.id)}
                disabled={unblocking === user.id}
                className="px-4 py-1.5 text-sm font-medium bg-zrp-red text-white rounded-full hover:bg-red-600 transition disabled:opacity-50 flex items-center gap-1 flex-shrink-0"
              >
                {unblocking === user.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Ban className="w-4 h-4" />
                    {t("blocked.unblock")}
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
