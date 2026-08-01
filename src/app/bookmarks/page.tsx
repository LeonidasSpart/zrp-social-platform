"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, ArrowLeft } from "lucide-react";
import PostCard from "@/components/PostCard";

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
  _count: {
    likes: number;
    comments: number;
    reposts: number;
  };
  liked?: boolean;
}

export default function BookmarksPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchBookmarks();
    }
  }, [status]);

  const fetchBookmarks = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/bookmarks");
      if (!res.ok) throw new Error("Failed to fetch bookmarks");
      const data = await res.json();
      setPosts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bookmarks");
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-gray-500 hover:text-gray-700 transition">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Bookmark className="w-6 h-6 text-yellow-500" />
          Bookmarks
        </h1>
        <span className="text-sm text-gray-500 ml-auto">{posts.length} saved</span>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm p-8 border border-gray-200 dark:border-gray-700 text-center">
          <Bookmark className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">No bookmarks yet</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            Save posts you want to read later by clicking the bookmark icon
          </p>
          <Link
            href="/"
            className="inline-block mt-4 text-blue-600 hover:underline text-sm"
          >
            Explore posts
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onUpdate={fetchBookmarks}
            />
          ))}
        </div>
      )}
    </div>
  );
}
