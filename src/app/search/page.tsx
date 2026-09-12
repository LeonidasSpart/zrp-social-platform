"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, Loader2, Users, FileText, RefreshCw } from "lucide-react";
import VerifiedBadge from "@/components/VerifiedBadge";
import PostCard from "@/components/PostCard";
import { useLanguage } from "@/contexts/LanguageContext";
import EmptyState from "@/components/ui/EmptyState";

interface User {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  badgeType: string | null;
}

interface Post {
  id: string;
  content: string;
  imageUrl?: string;
  createdAt: string;
  author: {
    id: string;
    username: string;
    name: string;
    avatarUrl?: string;
    badgeType?: string | null;
  };
  _count: {                     // ✅ required, added quotedBy
    likes: number;
    comments: number;
    reposts: number;
    quotedBy: number;
  };
  liked?: boolean;
}

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const query = searchParams.get("q") || "";
  const [users, setUsers] = useState<User[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const [activeTab, setActiveTab] = useState<"users" | "posts">("users");

  useEffect(() => {
    if (query.length < 2) {
      setUsers([]);
      setPosts([]);
      setSearchError(false);
      return;
    }

    const fetchResults = async () => {
      setLoading(true);
      setSearchError(false);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) {
          setSearchError(true);
          return;
        }
        const data = await res.json();
        setUsers(data.users || []);
        setPosts(data.posts || []);
      } catch (error) {
        console.error("Search error:", error);
        setSearchError(true);
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(fetchResults, 300);
    return () => clearTimeout(timer);
  }, [query, retryTick]);

  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      {/* Search led with its input and no heading at all, so the page
          had no name in the document outline. The field itself stays
          the visible entry point. */}
      <h1 className="sr-only">{t("nav.search")}</h1>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder={t("search.placeholder")}
          aria-label={t("search.placeholder")}
          value={query}
          onChange={(e) => {
            const newQuery = e.target.value;
            router.push(`/search?q=${encodeURIComponent(newQuery)}`);
          }}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-zrp-red focus:border-transparent"
          autoFocus
        />
      </div>

      {loading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-zrp-red" />
        </div>
      )}

      {!loading && searchError && (
        <div className="mt-4 rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 text-center">
          <p className="text-red-700 dark:text-red-400 font-semibold">
            {t("feed.tryAgain")}
          </p>
          <button
            onClick={() => setRetryTick((n) => n + 1)}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300 text-sm font-semibold"
          >
            <RefreshCw className="w-4 h-4" />
            {t("feed.retry")}
          </button>
        </div>
      )}

      {!loading && !searchError && query.length >= 2 && (
        <>
          <div className="flex border-b border-gray-200 dark:border-gray-700 mt-4">
            <button
              onClick={() => setActiveTab("users")}
              className={`flex-1 py-2 text-sm font-medium transition ${
                activeTab === "users"
                  ? "text-zrp-red border-b-2 border-zrp-red"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {t("search.usersTab", { n: users.length })}
            </button>
            <button
              onClick={() => setActiveTab("posts")}
              className={`flex-1 py-2 text-sm font-medium transition ${
                activeTab === "posts"
                  ? "text-zrp-red border-b-2 border-zrp-red"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {t("search.postsTab", { n: posts.length })}
            </button>
          </div>

          <div className="mt-4">
            {activeTab === "users" && (
              <>
                {users.length === 0 ? (
                  <EmptyState icon={Users} title={t("search.noUsers")} />
                ) : (
                  <div className="space-y-2">
                    {users.map((user) => (
                      <Link
                        key={user.id}
                        href={`/profile/${user.username}`}
                        className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition"
                      >
                        {/* ─── Avatar ─── */}
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
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === "posts" && (
              <>
                {posts.length === 0 ? (
                  <EmptyState icon={FileText} title={t("search.noPosts")} />
                ) : (
                  <div>
                    {posts.map((post) => (
                      <PostCard key={post.id} post={post} onUpdate={() => {}} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
