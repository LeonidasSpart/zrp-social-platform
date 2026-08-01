"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Search as SearchIcon, X } from "lucide-react";

interface UserResult {
  id: string;
  username: string;
  name: string;
  avatarUrl: string | null;
  bio: string | null;
  _count: {
    posts: number;
    followers: number;
  };
}

interface PostResult {
  id: string;
  content: string;
  createdAt: string;
  author: {
    id: string;
    username: string;
    name: string;
    avatarUrl: string | null;
  };
}

export default function SearchPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserResult[]>([]);
  const [posts, setPosts] = useState<PostResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  const handleSearch = async () => {
    if (query.length < 2) return;

    setLoading(true);
    setHasSearched(true);

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const clearSearch = () => {
    setQuery("");
    setUsers([]);
    setPosts([]);
    setHasSearched(false);
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search for users or posts..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-8"
            />
            {query && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={handleSearch}
            disabled={query.length < 2 || loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <SearchIcon className="w-5 h-5" />
          </button>
        </div>
        {query.length < 2 && (
          <p className="text-xs text-gray-400 mt-2">Type at least 2 characters to search</p>
        )}
      </div>

      {loading && (
        <div className="flex justify-center py-8">
          <div className="text-gray-500">Searching...</div>
        </div>
      )}

      {!loading && hasSearched && users.length === 0 && posts.length === 0 && (
        <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm p-8 border border-gray-200 text-center mt-4">
          <p className="text-gray-500">No results found for "{query}"</p>
        </div>
      )}

      {!loading && users.length > 0 && (
        <div className="mt-4">
          <h2 className="text-sm font-semibold text-gray-500 mb-2 uppercase">Users</h2>
          <div className="space-y-2">
            {users.map((user) => (
              <Link
                key={user.id}
                href={`/profile/${user.username}`}
                className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm p-4 border border-gray-200 hover:bg-gray-50 transition flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold flex-shrink-0">
                  {user.name?.[0] || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900">{user.name}</p>
                  <p className="text-sm text-gray-500">@{user.username}</p>
                  {user.bio && <p className="text-xs text-gray-400 truncate">{user.bio}</p>}
                </div>
                <div className="text-sm text-gray-400">
                  {user._count.posts} posts
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {!loading && posts.length > 0 && (
        <div className="mt-4">
          <h2 className="text-sm font-semibold text-gray-500 mb-2 uppercase">Posts</h2>
          <div className="space-y-2">
            {posts.map((post) => (
              <Link
                key={post.id}
                href={`/post/${post.id}`}
                className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm p-4 border border-gray-200 hover:bg-gray-50 transition block"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm text-gray-900">{post.author.name}</span>
                  <span className="text-gray-500 text-sm">@{post.author.username}</span>
                </div>
                <p className="text-gray-800">{post.content}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
