"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useState,
  useCallback,
  useRef,
  Fragment,
} from "react";

import PostComposer from "@/components/PostComposer";
import PostCard from "@/components/PostCard";
import AdCard from "@/components/AdCard";
import StoriesBar from "@/components/StoriesBar";

import {
  Sparkles,
  Users,
  RefreshCw,
  SlidersHorizontal,
  WifiOff,
  ChevronDown,
} from "lucide-react";

import { useLanguage } from "@/contexts/LanguageContext";

interface Post {
  id: string;
  content: string;
  imageUrl?: string;
  imageUrls?: string[];
  mediaType?: string;
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
    quotedBy: number;
  };

  liked?: boolean;
}

type FeedType = "for-you" | "following";

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();

  const [feedType, setFeedType] =
    useState<FeedType>("for-you");

  const [posts, setPosts] = useState<Post[]>([]);
  const [ad, setAd] = useState<any>(null);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [isOnline, setIsOnline] = useState(true);
  const [feedMenuOpen, setFeedMenuOpen] = useState(false);

  const cursorRef =
    useRef<string | null>(null);

  const observerRef =
    useRef<HTMLDivElement | null>(null);

  /*
   * ================================================================
   * ONLINE / OFFLINE
   * ================================================================
   */

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () =>
      setIsOnline(true);

    const handleOffline = () =>
      setIsOnline(false);

    window.addEventListener(
      "online",
      handleOnline
    );

    window.addEventListener(
      "offline",
      handleOffline
    );

    return () => {
      window.removeEventListener(
        "online",
        handleOnline
      );

      window.removeEventListener(
        "offline",
        handleOffline
      );
    };
  }, []);

  /*
   * ================================================================
   * FETCH POSTS
   * ================================================================
   */

  const fetchPosts = useCallback(
    async (
      cursor?: string | null
    ) => {
      const endpoint =
        feedType === "for-you"
          ? "/api/posts/explore"
          : "/api/posts";

      const url = cursor
        ? `${endpoint}?cursor=${encodeURIComponent(
            cursor
          )}&limit=10`
        : `${endpoint}?limit=10`;

      const res = await fetch(url);

      if (!res.ok) {
        throw new Error(
          "Failed to fetch posts"
        );
      }

      return res.json();
    },
    [feedType]
  );

  /*
   * ================================================================
   * LOAD POSTS
   * ================================================================
   */

  const loadPosts = useCallback(
    async (
      showRefreshAnimation = false
    ) => {
      if (showRefreshAnimation) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      try {
        const data =
          await fetchPosts(null);

        const postsData =
          data.posts || data;

        setPosts(postsData);

        cursorRef.current =
          data.nextCursor || null;

        setHasMore(
          !!data.nextCursor
        );
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fetchPosts]
  );

  /*
   * ================================================================
   * LOAD AD
   * ================================================================
   */

  useEffect(() => {
    fetch("/api/ads/serve")
      .then((res) =>
        res.ok
          ? res.json()
          : { ad: null }
      )
      .then((data) => {
        setAd(
          data.ad || null
        );
      })
      .catch(() => {
        setAd(null);
      });
  }, []);

  /*
   * ================================================================
   * LOAD MORE
   * ================================================================
   */

  const loadMore =
    useCallback(async () => {
      if (
        loadingMore ||
        !hasMore ||
        loading ||
        !cursorRef.current
      ) {
        return;
      }

      setLoadingMore(true);

      try {
        const data =
          await fetchPosts(
            cursorRef.current
          );

        const newPosts =
          data.posts || data;

        setPosts((prev) => [
          ...prev,
          ...newPosts,
        ]);

        cursorRef.current =
          data.nextCursor || null;

        setHasMore(
          !!data.nextCursor
        );
      } catch (err) {
        console.error(
          "Error loading more posts:",
          err
        );
      } finally {
        setLoadingMore(false);
      }
    }, [
      fetchPosts,
      hasMore,
      loading,
      loadingMore,
    ]);

  /*
   * ================================================================
   * FEED TAB
   * ================================================================
   */

  const handleTabChange = (
    tab: FeedType
  ) => {
    if (tab === feedType) {
      setFeedMenuOpen(false);
      return;
    }

    setFeedMenuOpen(false);

    setFeedType(tab);

    cursorRef.current = null;

    setHasMore(true);
    setPosts([]);
    setError(null);
  };

  /*
   * ================================================================
   * LOAD WHEN USER / FEED CHANGES
   * ================================================================
   */

  const userId =
    session?.user?.id;

  useEffect(() => {
    if (userId) {
      loadPosts();
    }
  }, [
    feedType,
    userId,
    loadPosts,
  ]);

  /*
   * ================================================================
   * INFINITE SCROLL
   * ================================================================
   */

  useEffect(() => {
    if (!observerRef.current) {
      return;
    }

    const observer =
      new IntersectionObserver(
        (entries) => {
          if (
            entries[0]
              .isIntersecting &&
            hasMore &&
            !loading &&
            !loadingMore
          ) {
            loadMore();
          }
        },
        {
          threshold: 0.1,
          rootMargin: "300px",
        }
      );

    observer.observe(
      observerRef.current
    );

    return () => {
      observer.disconnect();
    };
  }, [
    hasMore,
    loading,
    loadingMore,
    loadMore,
  ]);

  /*
   * ================================================================
   * NEW POST
   * ================================================================
   */

  const handlePostCreated = (
    newPost: Post
  ) => {
    setPosts((prev) => [
      newPost,
      ...prev,
    ]);
  };

  /*
   * ================================================================
   * POST UPDATE
   * ================================================================
   */

  const handleUpdate =
    useCallback(
      (
        deletedPostId?: string
      ) => {
        if (deletedPostId) {
          setPosts((prev) =>
            prev.filter(
              (post) =>
                post.id !==
                deletedPostId
            )
          );
        } else {
          loadPosts(true);
        }
      },
      [loadPosts]
    );

  /*
   * ================================================================
   * AUTH REDIRECT
   * ================================================================
   */

  useEffect(() => {
    if (
      status ===
      "unauthenticated"
    ) {
      router.push("/login");
    }
  }, [status, router]);

  /*
   * ================================================================
   * LOADING
   * ================================================================
   */

  if (status === "loading") {
    if (!isOnline) {
      return (
        <div className="max-w-2xl mx-auto py-8 px-4">
          <div className="rounded-2xl border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 p-6 text-center">
            <WifiOff className="w-8 h-8 mx-auto mb-3 text-yellow-600 dark:text-yellow-400" />

            <p className="text-yellow-700 dark:text-yellow-400 font-semibold">
              {t(
                "feed.offline"
              )}
            </p>

            <button
              onClick={() =>
                window.location.reload()
              }
              className="mt-4 px-4 py-2 rounded-full bg-yellow-100 dark:bg-yellow-800 text-yellow-700 dark:text-yellow-300 text-sm font-semibold"
            >
              {t(
                "feed.tryAgain"
              )}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-zrp-red border-t-transparent rounded-full animate-spin" />

          <span className="text-sm text-gray-500">
            {t(
              "action.loading"
            )}
          </span>
        </div>
      </div>
    );
  }

  /*
   * ================================================================
   * SESSION EXPIRED
   * ================================================================
   */

  if (
    status ===
    "unauthenticated"
  ) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">
          {t(
            "action.loading"
          )}
        </div>
      </div>
    );
  }

  /*
   * ================================================================
   * ERROR
   * ================================================================
   */

  if (error) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 text-center">
          <p className="text-red-700 dark:text-red-400 font-semibold">
            {t("feed.error", {
              message:
                error.message,
            })}
          </p>

          <button
            onClick={() =>
              loadPosts(true)
            }
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300 text-sm font-semibold"
          >
            <RefreshCw className="w-4 h-4" />

            {t(
              "feed.retry"
            )}
          </button>
        </div>
      </div>
    );
  }

  /*
   * ================================================================
   * MAIN HOME PAGE
   * ================================================================
   */

  return (
    <main className="w-full">

      <div className="max-w-2xl mx-auto px-3 sm:px-4 pt-0 pb-3 sm:pb-5">

        {/* ==========================================================
            REFRESH BUTTON
        ========================================================== */}

        <div className="flex justify-end mb-1">
          <button
            type="button"
            onClick={() =>
              loadPosts(true)
            }
            disabled={refreshing}
            aria-label="Refresh feed"
            className="flex items-center justify-center w-10 h-10 rounded-full border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-zrp-red hover:border-zrp-red/40 hover:bg-gray-50 dark:hover:bg-gray-800 transition disabled:opacity-50"
          >
            <RefreshCw
              className={`w-5 h-5 ${
                refreshing
                  ? "animate-spin"
                  : ""
              }`}
            />
          </button>
        </div>

        {/* ==========================================================
            STORIES
        ========================================================== */}

        <section className="mb-2 -mt-1">
          <StoriesBar />
        </section>

        {/* ==========================================================
            POST COMPOSER
        ========================================================== */}

        <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-zrp-deepBlack overflow-hidden">

          <PostComposer
            onPostCreated={
              handlePostCreated
            }
          />

        </section>

        {/* ==========================================================
            FEED CONTROLS
        ========================================================== */}

        <div className="sticky top-[64px] z-20 mt-3 bg-white/95 dark:bg-zrp-deepBlack/95 backdrop-blur-md">

          <div className="relative">

            <div className="flex items-center border-b border-gray-200 dark:border-gray-800">

              {/* For You */}

              <button
                type="button"
                onClick={() =>
                  handleTabChange(
                    "for-you"
                  )
                }
                className={`relative flex-1 flex items-center justify-center gap-2 py-4 text-sm font-semibold transition ${
                  feedType ===
                  "for-you"
                    ? "text-zrp-red"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                }`}
              >
                <Sparkles className="w-4 h-4" />

                <span>
                  {t(
                    "feed.forYou"
                  )}
                </span>

                {feedType ===
                  "for-you" && (
                  <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 rounded-full bg-zrp-red" />
                )}
              </button>

              {/* Following */}

              <button
                type="button"
                onClick={() =>
                  handleTabChange(
                    "following"
                  )
                }
                className={`relative flex-1 flex items-center justify-center gap-2 py-4 text-sm font-semibold transition ${
                  feedType ===
                  "following"
                    ? "text-zrp-red"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                }`}
              >
                <Users className="w-4 h-4" />

                <span>
                  {t(
                    "feed.following"
                  )}
                </span>

                {feedType ===
                  "following" && (
                  <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 rounded-full bg-zrp-red" />
                )}
              </button>

              {/* Feed settings */}

              <button
                type="button"
                onClick={() =>
                  setFeedMenuOpen(
                    (value) =>
                      !value
                  )
                }
                className="flex items-center justify-center w-12 h-full text-gray-500 dark:text-gray-400 hover:text-zrp-red transition"
                aria-label="Feed options"
                aria-expanded={
                  feedMenuOpen
                }
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>

            </div>

            {/* ======================================================
                FEED OPTIONS
            ====================================================== */}

            {feedMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-60 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl overflow-hidden">

                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Feed
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    handleTabChange(
                      "for-you"
                    )
                  }
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition ${
                    feedType ===
                    "for-you"
                      ? "text-zrp-red bg-zrp-red/10"
                      : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                >
                  <Sparkles className="w-4 h-4" />

                  <span className="flex-1">
                    {t(
                      "feed.forYou"
                    )}
                  </span>

                  {feedType ===
                    "for-you" && (
                    <span>
                      ✓
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleTabChange(
                      "following"
                    )
                  }
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition ${
                    feedType ===
                    "following"
                      ? "text-zrp-red bg-zrp-red/10"
                      : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                >
                  <Users className="w-4 h-4" />

                  <span className="flex-1">
                    {t(
                      "feed.following"
                    )}
                  </span>

                  {feedType ===
                    "following" && (
                    <span>
                      ✓
                    </span>
                  )}
                </button>

                <div className="border-t border-gray-200 dark:border-gray-700" />

                <button
                  type="button"
                  onClick={() => {
                    setFeedMenuOpen(
                      false
                    );

                    loadPosts(true);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                >
                  <RefreshCw className="w-4 h-4" />

                  <span>
                    Refresh feed
                  </span>
                </button>

              </div>
            )}

          </div>

        </div>

        {/* ==========================================================
            FEED
        ========================================================== */}

        <section className="mt-1">

          {loading ? (
            <div className="space-y-4 py-5">

              {[1, 2, 3].map(
                (item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4 animate-pulse"
                  >
                    <div className="flex gap-3">

                      <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-800" />

                      <div className="flex-1 space-y-3">

                        <div className="w-32 h-3 rounded bg-gray-200 dark:bg-gray-800" />

                        <div className="w-full h-3 rounded bg-gray-200 dark:bg-gray-800" />

                        <div className="w-3/4 h-3 rounded bg-gray-200 dark:bg-gray-800" />

                      </div>

                    </div>
                  </div>
                )
              )}

            </div>
          ) : posts.length === 0 ? (

            <div className="py-16 px-6 text-center">

              <div className="mx-auto w-16 h-16 rounded-full bg-zrp-red/10 flex items-center justify-center">

                {feedType ===
                "following" ? (
                  <Users className="w-7 h-7 text-zrp-red" />
                ) : (
                  <Sparkles className="w-7 h-7 text-zrp-red" />
                )}

              </div>

              <h2 className="mt-5 text-lg font-bold text-gray-900 dark:text-white">
                {t(
                  "feed.noPosts"
                )}
              </h2>

              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                {feedType ===
                "following"
                  ? t(
                      "feed.followSomeone"
                    )
                  : t(
                      "feed.checkBackLater"
                    )}
              </p>

              <button
                type="button"
                onClick={() =>
                  loadPosts(true)
                }
                className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-zrp-red text-white text-sm font-semibold hover:bg-zrp-darkRed transition"
              >
                <RefreshCw className="w-4 h-4" />

                Refresh
              </button>

            </div>
          ) : (

            <>
              {posts.map(
                (
                  post,
                  index
                ) => (
                  <Fragment
                    key={
                      post.id
                    }
                  >

                    <PostCard
                      post={
                        post
                      }
                      onUpdate={
                        handleUpdate
                      }
                    />

                    {/* ==================================================
                        AD
                    ================================================== */}

                    {ad &&
                      index ===
                        4 &&
                      posts.length >
                        5 && (
                      <AdCard
                        key={`ad-${ad.campaignId}`}
                        ad={ad}
                      />
                    )}

                  </Fragment>
                )
              )}

              {/* ========================================================
                  INFINITE SCROLL
              ======================================================== */}

              {hasMore && (
                <div
                  ref={
                    observerRef
                  }
                  className="h-20 flex items-center justify-center"
                >

                  {loadingMore ? (
                    <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">

                      <div className="w-4 h-4 border-2 border-zrp-red border-t-transparent rounded-full animate-spin" />

                      {t(
                        "feed.loadingMore"
                      )}

                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={
                        loadMore
                      }
                      className="flex items-center gap-2 px-4 py-2 rounded-full text-sm text-gray-400 dark:text-gray-500 hover:text-zrp-red hover:bg-zrp-red/5 transition"
                    >
                      Load more

                      <ChevronDown className="w-4 h-4" />
                    </button>
                  )}

                </div>
              )}

              {/* ========================================================
                  END OF FEED
              ======================================================== */}

              {!hasMore &&
                posts.length >
                  0 && (
                <div className="py-10 text-center">

                  <div className="mx-auto w-8 h-8 rounded-full bg-zrp-red/10 flex items-center justify-center">

                    <Sparkles className="w-4 h-4 text-zrp-red" />

                  </div>

                  <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">
                    {t(
                      "feed.endOfFeed"
                    )}
                  </p>

                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    You&apos;re all caught up.
                  </p>

                </div>
              )}

            </>
          )}

        </section>

      </div>

      {/* ============================================================
          OFFLINE INDICATOR
      ============================================================ */}

      {!isOnline && (
        <div className="fixed left-1/2 bottom-20 lg:bottom-6 -translate-x-1/2 z-40">

          <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-xl text-xs font-semibold">

            <WifiOff className="w-4 h-4" />

            You&apos;re offline

          </div>

        </div>
      )}

    </main>
  );
}
