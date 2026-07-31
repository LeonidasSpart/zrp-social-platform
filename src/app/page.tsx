"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import PostComposer from "@/components/PostComposer";
import PostCard from "@/components/PostCard";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";

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

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loadingMore, setLoadingMore] = useState(false);

  const {
    items: posts,
    loading,
    hasMore,
    error,
    fetchMore,
    reset,
    setItems,
  } = useInfiniteScroll<Post>({
    limit: 10,
    enabled: !!session,
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  // ─── Intersection Observer ──────────────────────────────────────
  const { elementRef, isVisible } = useIntersectionObserver<HTMLDivElement>({
    threshold: 0.1,
  });

  useEffect(() => {
    if (isVisible && hasMore && !loading && !loadingMore) {
      setLoadingMore(true);
      fetchMore().finally(() => setLoadingMore(false));
    }
  }, [isVisible, hasMore, loading, loadingMore, fetchMore]);

  const handlePostCreated = (newPost: Post) => {
    setItems((prev) => [newPost, ...prev]);
  };

  const handleUpdate = useCallback(() => {
    reset();
  }, [reset]);

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto py-4 px-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 font-medium">Error: {error.message}</p>
          <button
            onClick={() => reset()}
            className="mt-2 bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      <PostComposer onPostCreated={handlePostCreated} />

      <div className="mt-6 space-y-4">
        {posts.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>No posts yet. Be the first to post!</p>
          </div>
        ) : (
          <>
            {posts.map((post) => (
              <PostCard key={post.id} post={post} onUpdate={handleUpdate} />
            ))}

            {/* ─── Sentinel ─── */}
            {hasMore && (
              <div ref={elementRef} className="h-10 flex items-center justify-center">
                {loadingMore ? (
                  <div className="flex items-center gap-2 text-gray-400 text-sm">
                    <div className="w-4 h-4 border-2 border-zrp-red border-t-transparent rounded-full animate-spin" />
                    Loading more...
                  </div>
                ) : (
                  <span className="text-gray-400 text-sm">Load more</span>
                )}
              </div>
            )}

            {!hasMore && posts.length > 0 && (
              <div className="text-center py-4 text-gray-400 text-sm">
                You've reached the end of the feed. 🎉
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
