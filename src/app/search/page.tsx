"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, Loader2 } from "lucide-react";
import VerifiedBadge from "@/components/VerifiedBadge";
import PostCard from "@/components/PostCard";

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
  _count?: {
    likes: number;
    comments: number;
    reposts: number;
  };
  liked?: boolean;
}

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";
  const [users, setUsers] = useState<User[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"users" | "posts">("users");

  useEffect(() => {
    if (query.length < 2) {
      setUsers([]);
      setPosts([]);
      return;
    }

    const fetchResults = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setUsers(data.users || []);
        setPosts(data.posts || []);
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(fetchResults, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search users, posts, hashtags..."
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

      {!loading && query.length >= 2 && (
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
              Users ({users.length})
            </button>
            <button
              onClick={() => setActiveTab("posts")}
              className={`flex-1 py-2 text-sm font-medium transition ${
                activeTab === "posts"
                  ? "text-zrp-red border-b-2 border-zrp-red"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              Posts ({posts.length})
            </button>
          </div>

          <div className="mt-4">
            {activeTab === "users" && (
              <>
                {users.length === 0 ? (
                  <p className="text-center py-8 text-gray-500">No users found.</p>
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
                  <p className="text-center py-8 text-gray-500">No posts found.</p>
                ) : (
                  <div className="space-y-4">
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
