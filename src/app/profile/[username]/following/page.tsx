"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, use } from "react";
import Link from "next/link";
import { ArrowLeft, UserCheck, UserPlus, Loader2 } from "lucide-react";
import VerifiedBadge from "@/components/VerifiedBadge";
import { useLanguage } from "@/contexts/LanguageContext";

interface User {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  badgeType: string | null;
  isFollowing: boolean;
}

export default function FollowingPage(props: { params: Promise<{ username: string }> }) {
  const params = use(props.params);
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchFollowing();
    }
  }, [params.username, status]);

  const fetchFollowing = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${params.username}/following`);
      const data = await res.json();
      setUsers(data);
    } catch (error) {
      console.error("Error fetching following:", error);
    } finally {
      setLoading(false);
    }
  };

  // Same bug as followers/page.tsx - was always calling
  // /api/users/{params.username}/follow (the profile owner) instead of the
  // actual person in the clicked row.
  const handleFollow = async (targetUserId: string, targetUsername: string, currentState: boolean) => {
    if (!session) return;
    setFollowLoading(targetUserId);
    try {
      const res = await fetch(`/api/users/${targetUsername}/follow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: currentState ? "unfollow" : "follow" }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === targetUserId ? { ...u, isFollowing: !currentState } : u
          )
        );
      }
    } catch (error) {
      console.error("Follow error:", error);
    } finally {
      setFollowLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-4 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-zrp-red" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto bg-white dark:bg-zrp-deepBlack min-h-screen p-4">
      <div className="flex items-center gap-3 mb-4">
        <Link
          href={`/profile/${params.username}`}
          className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          {t("following.title")}
        </h1>
      </div>

      {users.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>{t("following.empty")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition"
            >
              <Link
                href={`/profile/${user.username}`}
                className="flex items-center gap-3 flex-1 min-w-0"
              >
                <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0">
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.name || user.username}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold">
                      {(user.name || user.username)[0].toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="font-semibold text-gray-900 dark:text-white truncate">
                      {user.name || user.username}
                    </span>
                    {user.badgeType && <VerifiedBadge badgeType={user.badgeType} />}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                    @{user.username}
                  </p>
                </div>
              </Link>

              {session?.user?.id !== user.id && (
                <button
                  onClick={() => handleFollow(user.id, user.username, user.isFollowing)}
                  disabled={followLoading === user.id}
                  className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium transition ${
                    user.isFollowing
                      ? "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
                      : "bg-zrp-red text-white hover:bg-zrp-darkRed"
                  }`}
                >
                  {followLoading === user.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : user.isFollowing ? (
                    <>
                      <UserCheck className="w-4 h-4" />
                      {t("action.following")}
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      {t("action.follow")}
                    </>
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
