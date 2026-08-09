"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import PostComposer from "@/components/PostComposer";
import PostCard from "@/components/PostCard";
import StoriesBar from "@/components/StoriesBar";
import { Sparkles, Users } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

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
    quotedBy: number; // ✅ required
  };
  liked?: boolean;
}

type FeedType = "for-you" | "following";

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();
  const [feedType, setFeedType] = useState<FeedType>("for-you");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const cursorRef = useRef<string | null>(null);
  const observerRef = useRef<HTMLDivElement | null>(null);

  // ─── Check online status ──────────────────────────────────────────
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // ─── Fetch posts based on feed type ──────────────────────────────
  const fetchPosts = useCallback(
    async (cursor?: string | null) => {
      const endpoint =
        feedType === "for-you"
          ? "/api/posts/explore"
          : "/api/posts";
      const url = cursor
        ? `${endpoint}?cursor=${cursor}&limit=10`
        : `${endpoint}?limit=10`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch posts");
      return res.json();
    },
    [feedType]
  );

  // ─── Load initial posts ────────────────────────────────────────────
  const loadPosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPosts(null);
      const postsData = data.posts || data;
      setPosts(postsData);
      cursorRef.current = data.nextCursor || null;
      setHasMore(!!data.nextCursor);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [fetchPosts]);

  // ─── Load more posts ──────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    try {
      const data = await fetchPosts(cursorRef.current);
      const newPosts = data.posts || data;
      setPosts((prev) => [...prev, ...newPosts]);
      cursorRef.current = data.nextCursor || null;
      setHasMore(!!data.nextCursor);
    } catch (err) {
      console.error("Error loading more:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPosts, hasMore, loading, loadingMore]);

  // ─── Reset feed when tab changes ──────────────────────────────────
  const handleTabChange = (tab: FeedType) => {
    if (tab === feedType) return;
    setFeedType(tab);
    cursorRef.current = null;
    setHasMore(true);
    setPosts([]);
  };

  // ─── Reload when feedType changes ──────────────────────────────────
  useEffect(() => {
    if (session) {
      loadPosts();
    }
  }, [feedType, session, loadPosts]);

  // ─── Intersection Observer for infinite scroll ────────────────────
  useEffect(() => {
    if (!observerRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(observerRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, loadMore]);

  // ─── Handle new post creation ─────────────────────────────────────
  const handlePostCreated = (newPost: Post) => {
    setPosts((prev) => [newPost, ...prev]);
  };

  const handleUpdate = useCallback(() => {
    loadPosts();
  }, [loadPosts]);

  // ─── Redirect if not authenticated ────────────────────────────────
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  // ─── If offline and session is loading, show offline message ────
  if (status === "loading") {
    if (!isOnline) {
      return (
        <div className="max-w-2xl mx-auto py-4 px-4">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 text-center">
            <p className="text-yellow-700 dark:text-yellow-400 font-medium">
              {t("feed.offline")}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 bg-yellow-100 dark:bg-yellow-800 text-yellow-700 dark:text-yellow-300 px-3 py-1 rounded-full text-sm"
            >
              {t("feed.tryAgain")}
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">{t("action.loading")}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto py-4 px-4">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-700 dark:text-red-400 font-medium">
            {t("feed.error", { message: error.message })}
          </p>
          <button
            onClick={() => loadPosts()}
            className="mt-2 bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300 px-3 py-1 rounded-full text-sm"
          >
            {t("feed.retry")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      {/* ─── Stories Bar ────────────────────────────────────────────── */}
      <StoriesBar />

      <PostComposer onPostCreated={handlePostCreated} />

      {/* ─── Tabs ────────────────────────────────────────────────────── */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mt-4">
        <button
          onClick={() => handleTabChange("for-you")}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition ${
            feedType === "for-you"
              ? "text-zrp-red border-b-2 border-zrp-red"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          {t("feed.forYou")}
        </button>
        <button
          onClick={() => handleTabChange("following")}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition ${
            feedType === "following"
              ? "text-zrp-red border-b-2 border-zrp-red"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          <Users className="w-4 h-4" />
          {t("feed.following")}
        </button>
      </div>

      {/* ─── Feed ────────────────────────────────────────────────────── */}
      <div className="mt-4 space-y-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-zrp-red border-t-transparent rounded-full animate-spin" />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <p>{t("feed.noPosts")}</p>
            {feedType === "following" && (
              <p className="text-sm">{t("feed.followSomeone")}</p>
            )}
            {feedType === "for-you" && (
              <p className="text-sm">{t("feed.checkBackLater")}</p>
            )}
          </div>
        ) : (
          <>
            {posts.map((post) => (
              <PostCard key={post.id} post={post} onUpdate={handleUpdate} />
            ))}

            {/* ─── Loading more indicator ────────────────────────────── */}
            {hasMore && (
              <div ref={observerRef} className="h-10 flex items-center justify-center">
                {loadingMore ? (
                  <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500 text-sm">
                    <div className="w-4 h-4 border-2 border-zrp-red border-t-transparent rounded-full animate-spin" />
                    {t("feed.loadingMore")}
                  </div>
                ) : (
                  <button
                    onClick={loadMore}
                    className="text-gray-400 dark:text-gray-500 hover:text-zrp-red dark:hover:text-zrp-red text-sm transition"
                  >
                    {t("feed.loadMore")}
                  </button>
                )}
              </div>
            )}

            {!hasMore && posts.length > 0 && (
              <div className="text-center py-4 text-gray-400 dark:text-gray-500 text-sm">
                {t("feed.endOfFeed")}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
