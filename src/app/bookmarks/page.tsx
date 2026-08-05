"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, ArrowLeft, Heart, MessageCircle, Repeat } from "lucide-react";
import PostCard from "@/components/PostCard";
import VerifiedBadge from "@/components/VerifiedBadge";

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
    quotedBy: number; // ✅ added
  };
  liked?: boolean;
}

interface Comment {
  id: string;
  content: string;
  imageUrl?: string;
  createdAt: string;
  postId: string;
  author: {
    id: string;
    username: string;
    name: string;
    avatarUrl?: string;
  };
  post: {
    id: string;
    content: string;
    author: {
      username: string;
      name: string;
    };
  };
}

interface BookmarkItem {
  type: "post" | "comment";
  id: string;
  createdAt: string;
  post?: Post;
  comment?: Comment;
}

function formatCount(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toString();
}

export default function BookmarksPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
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
      setBookmarks(data);
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
        <span className="text-sm text-gray-500 ml-auto">{bookmarks.length} saved</span>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      ) : bookmarks.length === 0 ? (
        <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm p-8 border border-gray-200 dark:border-gray-700 text-center">
          <Bookmark className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">No bookmarks yet</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            Save posts and comments you want to revisit by clicking the bookmark icon.
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
          {bookmarks.map((item) => {
            if (item.type === "post" && item.post) {
              return (
                <PostCard
                  key={item.id}
                  post={item.post}
                  onUpdate={fetchBookmarks}
                />
              );
            } else if (item.type === "comment" && item.comment) {
              const comment = item.comment;
              return (
                <Link
                  key={item.id}
                  href={`/post/${comment.postId}#comment-${comment.id}`}
                  className="block bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition border-l-4 border-l-zrp-red"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0">
                      {comment.author.avatarUrl ? (
                        <img
                          src={comment.author.avatarUrl}
                          alt={comment.author.name || comment.author.username}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold text-sm">
                          {(comment.author.name || comment.author.username)[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 dark:text-white text-sm">
                          {comment.author.name || comment.author.username}
                        </span>
                        <span className="text-xs text-gray-500">@{comment.author.username}</span>
                        <span className="text-xs text-gray-400">·</span>
                        <span className="text-xs text-gray-400">
                          {new Date(comment.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
                        {comment.content}
                      </p>
                      <div className="mt-1 text-xs text-gray-400">
                        Replying to{" "}
                        <span className="text-zrp-red">
                          @{comment.post.author.username}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            }
            return null;
          })}
        </div>
      )}
    </div>
  );
}
