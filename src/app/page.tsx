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
  updatedAt?: string;
  views?: number;

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

  isRepost?: boolean;

  repostOriginalAuthor?: {
    id: string;
    username: string;
    name: string;
  } | null;

  repostId?: string | null;

  commentsEnabled?: boolean;

  type?: "POST" | "RECRUITMENT" | "ARTICLE";

  company?: string;
  location?: string;
  applyUrl?: string;
  body?: string;
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
  const [loadingMore, setLoadingMore] =
    useState(false);
  const [refreshing, setRefreshing] =
    useState(false);

  const [hasMore, setHasMore] =
    useState(true);

  const [error, setError] =
    useState<Error | null>(null);

  const [isOnline, setIsOnline] =
    useState(true);

  const [feedMenuOpen, setFeedMenuOpen] =
    useState(false);

  /*
   * ================================================================
   * FEED REQUEST CONTROL
   * ================================================================
   *
   * These refs protect the feed from asynchronous race conditions.
   *
   * Example:
   *
   * Request A starts
   * Request B starts
   * Request B finishes first
   * Request A finishes later
   *
   * Without protection, Request A could overwrite the newer data.
   */

  const cursorRef =
    useRef<string | null>(null);

  const observerRef =
    useRef<HTMLDivElement | null>(null);

  const requestIdRef =
    useRef(0);

  const abortControllerRef =
    useRef<AbortController | null>(null);

  const loadingMoreRef =
    useRef(false);

  const refreshingRef =
    useRef(false);

  /*
   * Changes whenever the logical feed changes
   * or a local mutation invalidates existing requests.
   */
  const feedGenerationRef =
    useRef(0);

  /*
   * ================================================================
   * ONLINE / OFFLINE
   * ================================================================
   */

  useEffect(() => {
    setIsOnline(
      navigator.onLine
    );

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
   * CLEANUP ON UNMOUNT
   * ================================================================
   */

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  /*
   * ================================================================
   * FETCH POSTS
   * ================================================================
   */

  const fetchPosts = useCallback(
    async (
      cursor?: string | null,
      signal?: AbortSignal
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

      const res = await fetch(url, {
        signal,
        cache: "no-store",
      });

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
   * UNIQUE POSTS
   * ================================================================
   */

  const uniquePosts = (
    input: Post[]
  ): Post[] => {
    const seen =
      new Set<string>();

    return input.filter(
      (post) => {
        if (!post?.id) {
          return false;
        }

        if (
          seen.has(post.id)
        ) {
          return false;
        }

        seen.add(post.id);

        return true;
      }
    );
  };

  /*
   * ================================================================
   * LOAD / REFRESH FIRST PAGE
   * ================================================================
   */

  const loadPosts = useCallback(
    async (
      showRefreshAnimation = false
    ) => {
      /*
       * Every first-page request receives a unique ID.
       */
      const requestId =
        ++requestIdRef.current;

      /*
       * Capture the current feed generation.
       */
      const generation =
        feedGenerationRef.current;

      /*
       * Cancel the previous request.
       */
      abortControllerRef.current?.abort();

      const controller =
        new AbortController();

      abortControllerRef.current =
        controller;

      if (
        showRefreshAnimation
      ) {
        setRefreshing(true);
        refreshingRef.current =
          true;
      } else {
        setLoading(true);
      }

      setError(null);

      /*
       * The old pagination cursor must never be used while
       * the first page is being loaded.
       */
      cursorRef.current = null;

      setHasMore(false);

      /*
       * Prevent load-more requests from racing with refresh.
       */
      loadingMoreRef.current =
        false;

      setLoadingMore(false);

      try {
        const data =
          await fetchPosts(
            null,
            controller.signal
          );

        /*
         * Ignore stale responses.
         */
        if (
          requestId !==
            requestIdRef.current ||
          generation !==
            feedGenerationRef.current
        ) {
          return;
        }

        const postsData =
          Array.isArray(
            data?.posts
          )
            ? data.posts
            : Array.isArray(data)
            ? data
            : [];

        const cleanPosts =
          uniquePosts(
            postsData
          );

        setPosts(
          cleanPosts
        );

        cursorRef.current =
          data?.nextCursor ||
          null;

        setHasMore(
          Boolean(
            data?.nextCursor
          )
        );
      } catch (err) {
        /*
         * Abort is normal when a newer request replaces this one.
         */
        if (
          err instanceof
            DOMException &&
          err.name ===
            "AbortError"
        ) {
          return;
        }

        /*
         * Ignore stale errors too.
         */
        if (
          requestId !==
          requestIdRef.current
        ) {
          return;
        }

        console.error(
          "Error loading posts:",
          err
        );

        setError(
          err instanceof Error
            ? err
            : new Error(
                "Failed to load posts"
              )
        );
      } finally {
        /*
         * Only the currently active request may change loading state.
         */
        if (
          requestId ===
          requestIdRef.current
        ) {
          setLoading(false);
          setRefreshing(false);

          refreshingRef.current =
            false;
        }
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
    let cancelled = false;

    fetch("/api/ads/serve", {
      cache: "no-store",
    })
      .then((res) =>
        res.ok
          ? res.json()
          : { ad: null }
      )
      .then((data) => {
        if (cancelled) {
          return;
        }

        setAd(
          data?.ad || null
        );
      })
      .catch(() => {
        if (!cancelled) {
          setAd(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * ================================================================
   * LOAD MORE
   * ================================================================
   */

  const loadMore =
    useCallback(async () => {
      /*
       * React state can be one render behind.
       * The refs prevent duplicate observer calls immediately.
       */
      if (
        loadingMoreRef.current ||
        refreshingRef.current ||
        loading ||
        !hasMore ||
        !cursorRef.current
      ) {
        return;
      }

      const cursor =
        cursorRef.current;

      const generation =
        feedGenerationRef.current;

      /*
       * Each pagination request also gets an ID.
       */
      const requestId =
        ++requestIdRef.current;

      loadingMoreRef.current =
        true;

      setLoadingMore(true);

      try {
        const data =
          await fetchPosts(
            cursor
          );

        /*
         * If the user changed feed, refreshed, created a post,
         * deleted a post, or otherwise invalidated this request,
         * do not touch the current feed.
         */
        if (
          generation !==
            feedGenerationRef.current ||
          requestId !==
            requestIdRef.current
        ) {
          return;
        }

        const newPosts =
          Array.isArray(
            data?.posts
          )
            ? data.posts
            : Array.isArray(data)
            ? data
            : [];

        /*
         * Append only posts that are not already present.
         */
        setPosts((prev) => {
          const existingIds =
            new Set(
              prev.map(
                (post) =>
                  post.id
              )
            );

          const uniqueNewPosts =
            newPosts.filter(
              (post: Post) =>
                post?.id &&
                !existingIds.has(
                  post.id
                )
            );

          return [
            ...prev,
            ...uniqueNewPosts,
          ];
        });

        cursorRef.current =
          data?.nextCursor ||
          null;

        setHasMore(
          Boolean(
            data?.nextCursor
          )
        );
      } catch (err) {
        if (
          err instanceof
            DOMException &&
          err.name ===
            "AbortError"
        ) {
          return;
        }

        console.error(
          "Error loading more posts:",
          err
        );
      } finally {
        loadingMoreRef.current =
          false;

        setLoadingMore(false);
      }
    }, [
      fetchPosts,
      hasMore,
      loading,
    ]);

  /*
   * ================================================================
   * FEED TAB
   * ================================================================
   */

  const handleTabChange = (
    tab: FeedType
  ) => {
    if (
      tab === feedType
    ) {
      setFeedMenuOpen(false);
      return;
    }

    /*
     * Invalidate everything belonging to the old feed.
     */
    feedGenerationRef.current +=
      1;

    requestIdRef.current +=
      1;

    abortControllerRef.current?.abort();

    loadingMoreRef.current =
      false;

    refreshingRef.current =
      false;

    setLoadingMore(false);
    setRefreshing(false);

    setFeedMenuOpen(false);

    setFeedType(tab);

    cursorRef.current = null;

    setHasMore(true);
    setPosts([]);
    setError(null);
  };

  /*
   * ================================================================
   * USER
   * ================================================================
   */

  const userId =
    session?.user?.id;

  /*
   * ================================================================
   * LOAD WHEN USER / FEED CHANGES
   * ================================================================
   */

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
    if (
      !observerRef.current
    ) {
      return;
    }

    const observer =
      new IntersectionObserver(
        (entries) => {
          if (
            entries[0]
              ?.isIntersecting &&
            hasMore &&
            !loading &&
            !loadingMore &&
            !refreshingRef.current &&
            !loadingMoreRef.current
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

  const handlePostCreated =
    useCallback(
      (newPost: Post) => {
        /*
         * Protect against an empty response.
         */
        if (
          !newPost ||
          !newPost.id
        ) {
          /*
           * If the API returned no post object, perform a safe
           * refresh so the new post can still appear.
           */
          loadPosts(true);
          return;
        }

        /*
         * IMPORTANT:
         *
         * A post was created locally.
         *
         * Any request that started before this mutation must
         * no longer be allowed to overwrite the feed.
         */
        feedGenerationRef.current +=
          1;

        requestIdRef.current +=
          1;

        abortControllerRef.current?.abort();

        refreshingRef.current =
          false;

        setRefreshing(false);

        /*
         * Insert immediately at the top.
         *
         * Remove an existing copy first so the post can never
         * appear twice.
         */
        setPosts((prev) => {
          const withoutExisting =
            prev.filter(
              (post) =>
                post.id !==
                newPost.id
            );

          return [
            newPost,
            ...withoutExisting,
          ];
        });

        /*
         * Do NOT reset the pagination cursor.
         *
         * The new post is already in the local feed.
         * The existing cursor still represents the older portion
         * of the server feed.
         */
      },
      [loadPosts]
    );

  /*
   * ================================================================
   * POST UPDATE / DELETE
   * ================================================================
   */

  const handleUpdate =
    useCallback(
      (
        deletedPostId?: string
      ) => {
        /*
         * Invalidate requests created before the mutation.
         */
        feedGenerationRef.current +=
          1;

        requestIdRef.current +=
          1;

        abortControllerRef.current?.abort();

        loadingMoreRef.current =
          false;

        refreshingRef.current =
          false;

        setLoadingMore(false);
        setRefreshing(false);

        if (
          deletedPostId
        ) {
          /*
           * Delete immediately from the UI.
           */
          setPosts((prev) =>
            prev.filter(
              (post) =>
                post.id !==
                deletedPostId
            )
          );

          return;
        }

        /*
         * Edit/update:
         * reload the current feed safely.
         */
        loadPosts(true);
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
      router.push(
        "/login"
      );
    }
  }, [
    status,
    router,
  ]);

  /*
   * ================================================================
   * LOADING
   * ================================================================
   */

  if (
    status === "loading"
  ) {
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
      <div className="relative max-w-2xl mx-auto px-3 sm:px-4 pt-0 pb-3 sm:pb-5">

        {/* ==========================================================
            REFRESH BUTTON
        ========================================================== */}

        <button
          type="button"
          onClick={() =>
            loadPosts(true)
          }
          disabled={
            refreshing
          }
          aria-label="Refresh feed"
          className="absolute right-3 sm:right-4 top-10 z-10 flex items-center justify-center w-9 h-9 rounded-full bg-gray-50/90 dark:bg-gray-800/90 text-gray-500 dark:text-gray-400 hover:text-zrp-red hover:bg-zrp-red/10 transition disabled:opacity-50"
        >
          <RefreshCw
            className={`w-4 h-4 ${
              refreshing
                ? "animate-spin"
                : ""
            }`}
          />
        </button>

        {/* ==========================================================
            STORIES
        ========================================================== */}

        <section className="-mt-2 mb-1 pr-8">
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

              {/* FOR YOU */}

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

              {/* FOLLOWING */}

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

              {/* FEED SETTINGS */}

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

                <p className="px-4 py-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  {t("feed.chronologicalNote")}
                </p>

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
          ) : posts.length ===
            0 ? (
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
                      disabled={
                        refreshing ||
                        loading
                      }
                      className="flex items-center gap-2 px-4 py-2 rounded-full text-sm text-gray-400 dark:text-gray-500 hover:text-zrp-red hover:bg-zrp-red/5 transition disabled:opacity-50 disabled:cursor-not-allowed"
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
