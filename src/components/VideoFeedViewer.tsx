"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import {
  X,
  Heart,
  MessageCircle,
  Repeat,
  Share2,
  Bookmark,
  Volume2,
  VolumeX,
  Loader2,
  Lock,
} from "lucide-react";
import VerifiedBadge from "./VerifiedBadge";
import { belongsInVideoFeed, isLockedPremiumVideoPost } from "@/lib/video-feed";
import {
  getStoredSoundPreference,
  setStoredSoundPreference,
  playRespectingSoundPreference,
} from "@/lib/video-sound-preference";

interface VideoPost {
  id: string;
  content: string;
  imageUrl: string | null;
  imageUrls?: string[];
  mediaType?: string | null;
  createdAt: string;

  author: {
    id: string;
    username: string;
    name: string;
    avatarUrl?: string | null;
    badgeType?: string | null;
  };

  _count: {
    likes: number;
    comments: number;
    reposts: number;
    quotedBy: number;
  };

  liked?: boolean;
  reposted?: boolean;
  bookmarked?: boolean;

  // ⚠️ SECURITY: see src/lib/premium-content.ts. When `locked` is true,
  // `imageUrl` above has already been redacted server-side (never the
  // real video URL) - `previewContent`/`price`/`currency` are the only
  // premium fields safe to render.
  premiumPost?: {
    id: string;
    price: number;
    currency: string;
    previewContent: string;
    locked: boolean;
  } | null;
}

interface VideoFeedViewerProps {
  startPostId: string;
  onClose: () => void;
}

// ─────────────────────────────────────────────────────────────
// FORMAT COUNT
// ─────────────────────────────────────────────────────────────

function formatCount(n: number) {
  if (n >= 1_000_000) {
    return (
      (n / 1_000_000)
        .toFixed(1)
        .replace(/\.0$/, "") + "M"
    );
  }

  if (n >= 1_000) {
    return (
      (n / 1_000)
        .toFixed(1)
        .replace(/\.0$/, "") + "K"
    );
  }

  return n.toString();
}

// ─────────────────────────────────────────────────────────────
// MEDIA HELPERS
// ─────────────────────────────────────────────────────────────

function getMediaPath(url?: string | null) {
  if (!url) {
    return "";
  }

  return url
    .toLowerCase()
    .split("?")[0]
    .split("#")[0];
}

function isGifMedia(
  url?: string | null,
  mediaType?: string | null
) {
  const path = getMediaPath(url);

  return (
    path.endsWith(".gif") ||
    mediaType?.toLowerCase() === "gif"
  );
}

function isVideoMedia(
  url?: string | null,
  mediaType?: string | null
) {
  /*
   * IMPORTANT:
   *
   * GIF ALWAYS wins.
   *
   * A GIF must NEVER be treated as a video,
   * even if the database incorrectly says:
   *
   * mediaType: "video"
   */
  if (isGifMedia(url, mediaType)) {
    return false;
  }

  const path = getMediaPath(url);

  const videoExtensions = [
    ".mp4",
    ".webm",
    ".mov",
    ".avi",
    ".mkv",
    ".m4v",
    ".3gp",
  ];

  if (
    videoExtensions.some((extension) =>
      path.endsWith(extension)
    )
  ) {
    return true;
  }

  /*
   * Only trust explicit video type after
   * GIF has already been excluded.
   */
  if (
    mediaType?.toLowerCase() === "video"
  ) {
    return true;
  }

  /*
   * Some storage URLs may not expose a
   * standard extension.
   */
  if (
    path.includes("/video/") ||
    path.includes("/videos/")
  ) {
    return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────
// FILTER ONLY REAL VIDEOS
// ─────────────────────────────────────────────────────────────

function filterVideoPosts(
  posts: VideoPost[]
) {
  return posts.filter((post) => {
    if (!post) {
      return false;
    }

    /*
     * A locked premium video has no imageUrl (redacted server-side)
     * but still belongs on a slide of its own - see src/lib/video-feed.ts.
     */
    if (isLockedPremiumVideoPost(post)) {
      return true;
    }

    if (!belongsInVideoFeed(post)) {
      return false;
    }

    /*
     * GIFs are NEVER allowed into Shorts.
     */
    if (
      isGifMedia(
        post.imageUrl,
        post.mediaType
      )
    ) {
      return false;
    }

    /*
     * Only actual videos are allowed.
     */
    return isVideoMedia(
      post.imageUrl,
      post.mediaType
    );
  });
}

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export default function VideoFeedViewer({
  startPostId,
  onClose,
}: VideoFeedViewerProps) {
  const { data: session } = useSession();
  const { t } = useLanguage();

  const [videos, setVideos] = useState<
    VideoPost[]
  >([]);

  const [loading, setLoading] =
    useState(true);

  const [nextCursor, setNextCursor] =
    useState<string | null>(null);

  const [loadingMore, setLoadingMore] =
    useState(false);

  // Starts from the viewer's own stored preference (shared with Shorts
  // and Discover) rather than always muted - see PLAY ACTIVE VIDEO
  // below for the audible-autoplay-then-fallback-to-muted handling.
  const [muted, setMuted] =
    useState(() => !getStoredSoundPreference());

  const [activeIndex, setActiveIndex] =
    useState(0);

  const containerRef =
    useRef<HTMLDivElement>(null);

  const videoRefs =
    useRef<
      Record<
        string,
        HTMLVideoElement | null
      >
    >({});

  const hasFetchedInitial =
    useRef(false);

  // ─────────────────────────────────────────────────────────────
  // INITIAL LOAD
  // ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (hasFetchedInitial.current) {
      return;
    }

    hasFetchedInitial.current = true;

    const load = async () => {
      try {
        const res = await fetch(
          `/api/videos?startId=${encodeURIComponent(
            startPostId
          )}&limit=8`
        );

        if (res.ok) {
          const data =
            await res.json();

          const rawPosts =
            Array.isArray(data.posts)
              ? data.posts
              : [];

          /*
           * CRITICAL:
           *
           * Remove GIFs and anything that
           * is not a real video.
           */
          const validVideos =
            filterVideoPosts(
              rawPosts
            );

          setVideos(
            validVideos
          );

          setNextCursor(
            data.nextCursor ||
              null
          );
        }
      } catch (error) {
        console.error(
          "Error loading video feed:",
          error
        );
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [startPostId]);

  // ─────────────────────────────────────────────────────────────
  // LOAD MORE
  // ─────────────────────────────────────────────────────────────

  const loadMore =
    useCallback(async () => {
      if (
        loadingMore ||
        !nextCursor
      ) {
        return;
      }

      setLoadingMore(true);

      try {
        const res = await fetch(
          `/api/videos?cursor=${encodeURIComponent(
            nextCursor
          )}&limit=8`
        );

        if (res.ok) {
          const data =
            await res.json();

          const rawPosts =
            Array.isArray(data.posts)
              ? data.posts
              : [];

          /*
           * Again, filter GIFs from every
           * subsequent page.
           */
          const validVideos =
            filterVideoPosts(
              rawPosts
            );

          setVideos(
            (prev) => [
              ...prev,
              ...validVideos,
            ]
          );

          setNextCursor(
            data.nextCursor ||
              null
          );
        }
      } catch (error) {
        console.error(
          "Error loading more videos:",
          error
        );
      } finally {
        setLoadingMore(false);
      }
    }, [
      loadingMore,
      nextCursor,
    ]);

  // ─────────────────────────────────────────────────────────────
  // TRACK ACTIVE VIDEO
  // ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const container =
      containerRef.current;

    if (!container) {
      return;
    }

    const handleScroll = () => {
      if (
        container.clientHeight <= 0
      ) {
        return;
      }

      const index =
        Math.round(
          container.scrollTop /
            container.clientHeight
        );

      setActiveIndex(
        (prev) =>
          prev !== index
            ? index
            : prev
      );

      /*
       * Fetch more once within 2 videos
       * of the end.
       */
      if (
        index >=
          videos.length - 2 &&
        nextCursor
      ) {
        loadMore();
      }
    };

    container.addEventListener(
      "scroll",
      handleScroll,
      {
        passive: true,
      }
    );

    return () => {
      container.removeEventListener(
        "scroll",
        handleScroll
      );
    };
  }, [
    videos.length,
    nextCursor,
    loadMore,
  ]);

  // ─────────────────────────────────────────────────────────────
  // PLAY ACTIVE VIDEO
  // ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const playActive = () => {
      Object.entries(
        videoRefs.current
      ).forEach(([id, el]) => {
        if (!el) {
          return;
        }

        const post =
          videos[activeIndex];

        if (
          post &&
          id === post.id
        ) {
          playRespectingSoundPreference(el, !muted, () =>
            setMuted(true)
          );
        } else {
          el.pause();
        }
      });
    };

    // A backgrounded browser tab was never told to pause - the active
    // video (and its audio, if unmuted) kept playing behind the scenes.
    // Pausing on hide and resuming (respecting the current sound
    // preference) on return matches every mainstream video product.
    const handleVisibilityChange = () => {
      if (document.hidden) {
        const post = videos[activeIndex];
        const el = post
          ? videoRefs.current[post.id]
          : null;
        el?.pause();
      } else {
        playActive();
      }
    };

    playActive();

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );
    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, [
    activeIndex,
    videos,
    muted,
  ]);

  // ─────────────────────────────────────────────────────────────
  // WATCH TRACKING
  // ─────────────────────────────────────────────────────────────
  //
  // Reuses the existing per-post view counter (POST
  // /api/posts/[id]/view, same one PostCard already calls) rather than
  // inventing a second analytics system. Deduped with a ref Set so a
  // video is counted at most once per time this viewer is open,
  // regardless of how many times the activeIndex effect above re-runs
  // for the same slide (re-renders, mute toggles, scroll jitter).
  // ─────────────────────────────────────────────────────────────

  const trackedViewIds =
    useRef<Set<string>>(
      new Set()
    );

  useEffect(() => {
    const post =
      videos[activeIndex];

    if (
      !post ||
      isLockedPremiumVideoPost(
        post
      )
    ) {
      return;
    }

    if (
      trackedViewIds.current.has(
        post.id
      )
    ) {
      return;
    }

    trackedViewIds.current.add(
      post.id
    );

    fetch(
      `/api/posts/${post.id}/view`,
      {
        method: "POST",
      }
    ).catch(() => {
      // Views aren't critical - never surface this to the viewer.
    });
  }, [
    activeIndex,
    videos,
  ]);

  // ─────────────────────────────────────────────────────────────
  // LOCK BODY SCROLL
  // ─────────────────────────────────────────────────────────────

  useBodyScrollLock(true);

  // ─────────────────────────────────────────────────────────────
  // SCROLL TO INDEX
  // ─────────────────────────────────────────────────────────────

  const scrollToIndex =
    useCallback(
      (index: number) => {
        const container =
          containerRef.current;

        if (!container) {
          return;
        }

        const clamped =
          Math.max(
            0,
            Math.min(
              index,
              videos.length - 1
            )
          );

        container.scrollTo({
          top:
            clamped *
            container.clientHeight,
          behavior: "smooth",
        });
      },
      [videos.length]
    );

  // ─────────────────────────────────────────────────────────────
  // KEYBOARD NAVIGATION
  // ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const handleKey = (
      e: KeyboardEvent
    ) => {
      if (
        e.key === "Escape"
      ) {
        onClose();
        return;
      }

      if (
        e.key === "ArrowDown"
      ) {
        e.preventDefault();
        scrollToIndex(
          activeIndex + 1
        );
        return;
      }

      if (
        e.key === "ArrowUp"
      ) {
        e.preventDefault();
        scrollToIndex(
          activeIndex - 1
        );
      }
    };

    window.addEventListener(
      "keydown",
      handleKey
    );

    return () =>
      window.removeEventListener(
        "keydown",
        handleKey
      );
  }, [
    activeIndex,
    onClose,
    scrollToIndex,
  ]);

  // ─────────────────────────────────────────────────────────────
  // TIME AGO
  // ─────────────────────────────────────────────────────────────

  const timeAgo = (
    date: string
  ) => {
    const diff =
      Date.now() -
      new Date(date).getTime();

    const minutes =
      Math.floor(
        diff / 60000
      );

    if (minutes < 1) {
      return t("notifications.justNow");
    }

    if (minutes < 60) {
      return t("time.minutesShort", { n: minutes });
    }

    const hours =
      Math.floor(
        minutes / 60
      );

    if (hours < 24) {
      return t("time.hoursShort", { n: hours });
    }

    return t("time.daysShort", { n: Math.floor(hours / 24) });
  };

  // ─────────────────────────────────────────────────────────────
  // LIKE
  // ─────────────────────────────────────────────────────────────

  const handleLike =
    async (postId: string) => {
      if (!session) {
        return;
      }

      // Snapshot the pre-optimistic array so a failed/thrown request can
      // restore it exactly, rather than recomputing the inverse - the
      // recompute-on-rollback approach previously here read `video.liked`
      // AFTER the optimistic flip had already been applied, so its
      // condition was inverted and the like COUNT landed two off from
      // truth on every rejected/failed like (e.g. rate-limited or
      // blocked-user 403) instead of back at its original value.
      const previousVideos = videos;

      setVideos((prev) =>
        prev.map((video) =>
          video.id === postId
            ? {
                ...video,
                liked:
                  !video.liked,
                _count: {
                  ...video._count,
                  likes:
                    video.liked
                      ? Math.max(
                          0,
                          video
                            ._count
                            .likes -
                            1
                        )
                      : video
                          ._count
                          .likes +
                        1,
                },
              }
            : video
        )
      );

      try {
        const res =
          await fetch(
            `/api/posts/${postId}/like`,
            {
              method: "POST",
            }
          );

        // Reject the optimistic update on ANY failure - an HTTP error
        // response or a thrown network error (e.g. the request never
        // reached the server at all) must roll back the same way, or the
        // optimistic "liked" state can survive locally even though
        // nothing was ever persisted.
        if (!res.ok) {
          setVideos(previousVideos);
        }
      } catch (error) {
        console.error(
          "Error liking video:",
          error
        );
        setVideos(previousVideos);
      }
    };

  // ─────────────────────────────────────────────────────────────
  // REPOST
  // ─────────────────────────────────────────────────────────────
  //
  // Reuses POST /api/posts/[id]/repost - the same endpoint
  // src/app/shorts/page.tsx's handleRepost already calls. This viewer's
  // Repost button previously rendered the count with no onClick at all,
  // so it silently did nothing when tapped.
  // ─────────────────────────────────────────────────────────────

  const handleRepost =
    async (postId: string) => {
      if (!session) {
        return;
      }

      try {
        const res =
          await fetch(
            `/api/posts/${postId}/repost`,
            {
              method: "POST",
            }
          );

        if (res.ok) {
          const data =
            await res.json();

          setVideos((prev) =>
            prev.map((video) =>
              video.id === postId
                ? {
                    ...video,
                    reposted:
                      data.reposted,
                    _count: {
                      ...video._count,
                      reposts:
                        data.reposted
                          ? video
                              ._count
                              .reposts +
                            1
                          : Math.max(
                              0,
                              video
                                ._count
                                .reposts -
                                1
                            ),
                    },
                  }
                : video
            )
          );
        }
      } catch (error) {
        console.error(
          "Error reposting video:",
          error
        );
      }
    };

  // ─────────────────────────────────────────────────────────────
  // BOOKMARK (SAVE)
  // ─────────────────────────────────────────────────────────────
  //
  // Reuses POST /api/posts/[id]/bookmark - same endpoint PostCard uses
  // for every other post type. Save was entirely missing from this
  // viewer's interaction rail.
  // ─────────────────────────────────────────────────────────────

  const [bookmarkLoading, setBookmarkLoading] =
    useState<string | null>(null);

  const handleBookmark =
    async (postId: string) => {
      if (!session || bookmarkLoading) {
        return;
      }

      setBookmarkLoading(postId);

      setVideos((prev) =>
        prev.map((video) =>
          video.id === postId
            ? {
                ...video,
                bookmarked:
                  !video.bookmarked,
              }
            : video
        )
      );

      try {
        const res =
          await fetch(
            `/api/posts/${postId}/bookmark`,
            {
              method: "POST",
            }
          );

        if (res.ok) {
          const data =
            await res.json();

          setVideos((prev) =>
            prev.map((video) =>
              video.id === postId
                ? {
                    ...video,
                    bookmarked:
                      data.bookmarked,
                  }
                : video
            )
          );
        } else {
          // Roll back the optimistic toggle.
          setVideos((prev) =>
            prev.map((video) =>
              video.id === postId
                ? {
                    ...video,
                    bookmarked:
                      !video.bookmarked,
                  }
                : video
            )
          );
        }
      } catch (error) {
        console.error(
          "Error bookmarking video:",
          error
        );

        setVideos((prev) =>
          prev.map((video) =>
            video.id === postId
              ? {
                  ...video,
                  bookmarked:
                    !video.bookmarked,
                }
              : video
          )
        );
      } finally {
        setBookmarkLoading(null);
      }
    };

  // ─────────────────────────────────────────────────────────────
  // SHARE
  // ─────────────────────────────────────────────────────────────

  const handleShare =
    async (
      post: VideoPost
    ) => {
      const url = `${window.location.origin}/post/${post.id}`;

      if (
        navigator.share
      ) {
        try {
          await navigator.share(
            {
              title: t(
                "shorts.sharePostBy",
                {
                  name:
                    post.author
                      .name ||
                    post.author
                      .username,
                }
              ),
              url,
            }
          );
        } catch {
          // User cancelled share.
        }
      } else {
        try {
          await navigator.clipboard.writeText(
            url
          );
        } catch {
          // Clipboard unavailable.
        }
      }
    };

  // ─────────────────────────────────────────────────────────────
  // LOADING
  // ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black z-[100] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white animate-spin" />

        <button
          onClick={onClose}
          className="absolute top-[calc(1rem+env(safe-area-inset-top))] right-4 text-white bg-black/50 rounded-full p-2 hover:bg-black/70 transition"
          aria-label={t("shorts.close")}
        >
          <X className="w-6 h-6" />
        </button>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // NO VIDEOS
  // ─────────────────────────────────────────────────────────────

  if (videos.length === 0) {
    return (
      <div className="fixed inset-0 bg-black z-[100] flex flex-col items-center justify-center gap-4">
        <p className="text-white text-center px-6">
          {t("shorts.noVideosAvailable")}
        </p>

        <button
          onClick={onClose}
          className="text-white bg-white/10 rounded-full px-4 py-2 hover:bg-white/20 transition"
        >
          {t("shorts.close")}
        </button>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black z-[100]">
      {/* CLOSE

          These buttons are direct children of this `fixed inset-0`
          container, so their offset is measured from the true viewport
          edge. layout.tsx sets viewportFit: "cover", so in an installed
          standalone PWA the viewport starts underneath the system status
          bar / notch and env(safe-area-inset-top) is non-zero there - a
          bare top-4 (16px) then draws the close/mute buttons across the
          clock and battery icons. shorts/page.tsx (the other, adjacent
          fullscreen video viewer) already carries this fix; this is a
          second, separate viewer - opened by tapping a video post in the
          feed rather than from the Shorts tab - that had the old,
          unfixed offset. In an ordinary mobile browser the address bar
          already clears the status bar and the inset resolves to 0, so
          calc(1rem + 0px) stays the original 16px there. */}
      <button
        onClick={onClose}
        className="absolute top-[calc(1rem+env(safe-area-inset-top))] right-4 z-30 text-white bg-black/40 rounded-full p-2 hover:bg-black/60 transition"
        aria-label={t("shorts.close")}
      >
        <X className="w-6 h-6" />
      </button>

      {/* MUTE */}
      <button
        onClick={() =>
          setMuted((m) => {
            const next = !m;
            setStoredSoundPreference(!next);
            return next;
          })
        }
        className="absolute top-[calc(1rem+env(safe-area-inset-top))] left-4 z-30 text-white bg-black/40 rounded-full p-2 hover:bg-black/60 transition"
        aria-label={
          muted
            ? t("shorts.unmute")
            : t("shorts.mute")
        }
      >
        {muted ? (
          <VolumeX className="w-5 h-5" />
        ) : (
          <Volume2 className="w-5 h-5" />
        )}
      </button>

      {/* VIDEO FEED */}
      <div
        ref={containerRef}
        className="h-full w-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
        style={{
          scrollbarWidth:
            "none",
        }}
      >
        {videos.map(
          (
            post,
            index
          ) => {
            /*
             * FINAL SAFETY CHECK.
             *
             * Even though GIFs are already
             * filtered before entering state,
             * check again before rendering.
             */
            const gif =
              isGifMedia(
                post.imageUrl,
                post.mediaType
              );

            const realVideo =
              isVideoMedia(
                post.imageUrl,
                post.mediaType
              );

            const locked =
              isLockedPremiumVideoPost(
                post
              );

            /*
             * This should never happen because
             * filterVideoPosts() removes them.
             *
             * Keeping the guard makes the component
             * safe if the API changes later. A locked
             * premium video legitimately has no
             * imageUrl (redacted server-side) and is
             * rendered as its own locked slide below,
             * not dropped.
             */
            if (
              !locked &&
              (!realVideo || gif)
            ) {
              return null;
            }

            return (
              <div
                key={post.id}
                className="relative h-full w-full snap-start snap-always flex items-center justify-center"
              >
                {/* REAL VIDEO, OR A LOCKED-PREMIUM SLIDE.
                    ⚠️ SECURITY: `locked` is true only when the server
                    already redacted `imageUrl` to null (see
                    src/lib/premium-content.ts) - never rendered a
                    <video> at all in that case, so the real media URL
                    never reaches the client for a post the viewer
                    hasn't purchased. */}
                {locked ? (
                  <div className="flex flex-col items-center gap-3 px-8 text-center text-white">
                    <div className="rounded-full bg-white/10 p-4">
                      <Lock className="w-8 h-8" />
                    </div>

                    <p className="font-semibold">
                      {t(
                        "shorts.premiumLockedTitle"
                      )}
                    </p>

                    {post.premiumPost && (
                      <p className="text-sm text-white/70">
                        {t(
                          "shorts.premiumLockedBody",
                          {
                            price:
                              post
                                .premiumPost
                                .price,
                            currency:
                              post
                                .premiumPost
                                .currency,
                          }
                        )}
                      </p>
                    )}

                    <Link
                      href={`/post/${post.id}`}
                      onClick={onClose}
                      className="mt-2 rounded-full bg-white/15 px-4 py-2 text-sm font-medium hover:bg-white/25 transition"
                    >
                      {t(
                        "shorts.premiumLockedCta"
                      )}
                    </Link>
                  </div>
                ) : (
                  <video
                    ref={(el) => {
                      videoRefs.current[
                        post.id
                      ] = el;
                    }}
                    src={
                      post.imageUrl ??
                      undefined
                    }
                    className="max-h-full max-w-full object-contain"
                    loop
                    muted={
                      muted
                    }
                    playsInline
                    webkit-playsinline="true"
                    preload="metadata"
                    controls={false}
                    onClick={(
                      e
                    ) => {
                      e.stopPropagation();

                      const el =
                        e.currentTarget;

                      if (
                        el.paused
                      ) {
                        el.play().catch(
                          () => {}
                        );
                      } else {
                        el.pause();
                      }
                    }}
                  />
                )}

                {/* ─────────────────────────────────────────────
                    OVERLAY
                    ───────────────────────────────────────────── */}

                {/* BottomNav is a portal at z-[9999] - above this
                    z-[100] viewer - fixed at the bottom of the screen
                    on every route below the lg breakpoint (mobile web,
                    PWA, tablet), so it paints on top of whatever lands
                    in the bottom strip here. pb-8 (32px) is less than
                    its real footprint (h-14 = 56px plus its own
                    safe-area inset), which hid the author row and the
                    like/comment/repost/share action rail behind it on
                    a real phone/tablet - reported as "the Short menu is
                    invisible" since BottomNav is opaque. Same fix
                    already applied to shorts/page.tsx's own identical
                    bottom overlay; ported here since this is a second,
                    separate full-screen video viewer (opened by tapping
                    a video post in the feed) that had the old, narrower
                    padding. Desktop is unaffected (BottomNav is
                    lg:hidden there). */}
                <div className="absolute inset-x-0 bottom-0 p-4 pb-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none">
                  <div className="flex items-end justify-between gap-4">
                    {/* AUTHOR + CAPTION */}
                    <div className="flex-1 min-w-0 text-white pointer-events-auto">
                      <Link
                        href={`/profile/${post.author.username}`}
                        className="flex min-w-0 items-center gap-2 mb-2"
                        onClick={
                          onClose
                        }
                      >
                        <div className="w-9 h-9 rounded-full bg-gray-700 overflow-hidden flex-shrink-0">
                          {post
                            .author
                            .avatarUrl ? (
                            <img
                              src={
                                post
                                  .author
                                  .avatarUrl
                              }
                              alt={
                                post
                                  .author
                                  .name ||
                                post
                                  .author
                                  .username
                              }
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center font-bold">
                              {(
                                post
                                  .author
                                  .name ||
                                post
                                  .author
                                  .username
                              )
                                .charAt(
                                  0
                                )
                                .toUpperCase()}
                            </div>
                          )}
                        </div>

                        <span className="font-semibold flex min-w-0 items-center gap-1">
                          <span className="truncate">
                            {post
                              .author
                              .name ||
                              post
                                .author
                                .username}
                          </span>

                          <VerifiedBadge
                            badgeType={
                              post
                                .author
                                .badgeType
                            }
                            className="flex-shrink-0"
                          />
                        </span>

                        <span className="text-white/70 text-sm flex-shrink-0">
                          ·{" "}
                          {timeAgo(
                            post.createdAt
                          )}
                        </span>
                      </Link>

                      {post.content && (
                        <p className="text-sm whitespace-pre-wrap break-words line-clamp-3">
                          {
                            post.content
                          }
                        </p>
                      )}
                    </div>

                    {/* ACTION RAIL */}
                    <div className="flex flex-col items-center gap-4 flex-shrink-0 text-white pointer-events-auto">
                      {/* LIKE */}
                      <button
                        onClick={() =>
                          handleLike(
                            post.id
                          )
                        }
                        className="flex flex-col items-center gap-1"
                        aria-label={t("shorts.like")}
                        aria-pressed={!!post.liked}
                      >
                        <Heart
                          className={`w-7 h-7 ${
                            post.liked
                              ? "fill-red-500 text-red-500"
                              : ""
                          }`}
                        />

                        <span className="text-xs">
                          {formatCount(
                            post
                              ._count
                              .likes
                          )}
                        </span>
                      </button>

                      {/* COMMENTS */}
                      <Link
                        href={`/post/${post.id}`}
                        className="flex flex-col items-center gap-1"
                        onClick={
                          onClose
                        }
                      >
                        <MessageCircle className="w-7 h-7" />

                        <span className="text-xs">
                          {formatCount(
                            post
                              ._count
                              .comments
                          )}
                        </span>
                      </Link>

                      {/* REPOST */}
                      <button
                        onClick={() =>
                          handleRepost(
                            post.id
                          )
                        }
                        className="flex flex-col items-center gap-1"
                        aria-label={t("shorts.repost")}
                        aria-pressed={!!post.reposted}
                      >
                        <Repeat
                          className={`w-7 h-7 ${
                            post.reposted
                              ? "text-green-500"
                              : ""
                          }`}
                        />

                        <span className="text-xs">
                          {formatCount(
                            post
                              ._count
                              .reposts
                          )}
                        </span>
                      </button>

                      {/* SAVE */}
                      <button
                        onClick={() =>
                          handleBookmark(
                            post.id
                          )
                        }
                        disabled={
                          bookmarkLoading ===
                          post.id
                        }
                        className="flex flex-col items-center gap-1"
                        aria-label={t("nav.bookmarks")}
                        aria-pressed={!!post.bookmarked}
                      >
                        <Bookmark
                          className={`w-7 h-7 ${
                            post.bookmarked
                              ? "fill-white text-white"
                              : ""
                          }`}
                        />
                      </button>

                      {/* SHARE */}
                      <button
                        onClick={() =>
                          handleShare(
                            post
                          )
                        }
                        className="flex flex-col items-center gap-1"
                        aria-label={t("shorts.share")}
                      >
                        <Share2 className="w-7 h-7" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* LOADING MORE */}
                {index ===
                  videos.length -
                    1 &&
                  loadingMore && (
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                    </div>
                  )}
              </div>
            );
          }
        )}
      </div>
    </div>
  );
}
