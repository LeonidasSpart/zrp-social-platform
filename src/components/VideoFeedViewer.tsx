"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  X,
  Heart,
  MessageCircle,
  Repeat,
  Share2,
  Volume2,
  VolumeX,
  Loader2,
} from "lucide-react";
import VerifiedBadge from "./VerifiedBadge";

interface VideoPost {
  id: string;
  content: string;
  imageUrl: string;
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
    if (!post?.imageUrl) {
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

  const [videos, setVideos] = useState<
    VideoPost[]
  >([]);

  const [loading, setLoading] =
    useState(true);

  const [nextCursor, setNextCursor] =
    useState<string | null>(null);

  const [loadingMore, setLoadingMore] =
    useState(false);

  const [muted, setMuted] =
    useState(true);

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
        el.muted = muted;

        el.play().catch(
          () => {}
        );
      } else {
        el.pause();
      }
    });
  }, [
    activeIndex,
    videos,
    muted,
  ]);

  // ─────────────────────────────────────────────────────────────
  // LOCK BODY SCROLL
  // ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    return () => {
      document.body.style.overflow =
        previousOverflow;
    };
  }, []);

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
      return "Just now";
    }

    if (minutes < 60) {
      return `${minutes}m`;
    }

    const hours =
      Math.floor(
        minutes / 60
      );

    if (hours < 24) {
      return `${hours}h`;
    }

    return `${Math.floor(
      hours / 24
    )}d`;
  };

  // ─────────────────────────────────────────────────────────────
  // LIKE
  // ─────────────────────────────────────────────────────────────

  const handleLike =
    async (postId: string) => {
      if (!session) {
        return;
      }

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

        if (!res.ok) {
          /*
           * Reload state if the API
           * rejected the optimistic update.
           */
          setVideos((prev) =>
            prev.map((video) =>
              video.id ===
              postId
                ? {
                    ...video,
                    liked:
                      !video.liked,
                    _count: {
                      ...video._count,
                      likes:
                        video.liked
                          ? video
                              ._count
                              .likes +
                            1
                          : Math.max(
                              0,
                              video
                                ._count
                                .likes -
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
          "Error liking video:",
          error
        );
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
              title: `Post by ${
                post.author
                  .name ||
                post.author
                  .username
              }`,
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
          className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2 hover:bg-black/70 transition"
          aria-label="Close"
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
          No videos are available
          right now.
        </p>

        <button
          onClick={onClose}
          className="text-white bg-white/10 rounded-full px-4 py-2 hover:bg-white/20 transition"
        >
          Close
        </button>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black z-[100]">
      {/* CLOSE */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-30 text-white bg-black/40 rounded-full p-2 hover:bg-black/60 transition"
        aria-label="Close"
      >
        <X className="w-6 h-6" />
      </button>

      {/* MUTE */}
      <button
        onClick={() =>
          setMuted(
            (m) => !m
          )
        }
        className="absolute top-4 left-4 z-30 text-white bg-black/40 rounded-full p-2 hover:bg-black/60 transition"
        aria-label={
          muted
            ? "Unmute"
            : "Mute"
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

            /*
             * This should never happen because
             * filterVideoPosts() removes them.
             *
             * Keeping the guard makes the component
             * safe if the API changes later.
             */
            if (
              !realVideo ||
              gif
            ) {
              return null;
            }

            return (
              <div
                key={post.id}
                className="relative h-full w-full snap-start snap-always flex items-center justify-center"
              >
                {/* REAL VIDEO ONLY */}
                <video
                  ref={(el) => {
                    videoRefs.current[
                      post.id
                    ] = el;
                  }}
                  src={
                    post.imageUrl
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

                {/* ─────────────────────────────────────────────
                    OVERLAY
                    ───────────────────────────────────────────── */}

                <div className="absolute inset-x-0 bottom-0 p-4 pb-8 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none">
                  <div className="flex items-end justify-between gap-4">
                    {/* AUTHOR + CAPTION */}
                    <div className="flex-1 min-w-0 text-white pointer-events-auto">
                      <Link
                        href={`/profile/${post.author.username}`}
                        className="flex items-center gap-2 mb-2"
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

                        <span className="font-semibold flex items-center gap-1">
                          {post
                            .author
                            .name ||
                            post
                              .author
                              .username}

                          <VerifiedBadge
                            badgeType={
                              post
                                .author
                                .badgeType
                            }
                          />
                        </span>

                        <span className="text-white/70 text-sm">
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
                        aria-label="Like"
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
                      <div className="flex flex-col items-center gap-1">
                        <Repeat className="w-7 h-7" />

                        <span className="text-xs">
                          {formatCount(
                            post
                              ._count
                              .reposts
                          )}
                        </span>
                      </div>

                      {/* SHARE */}
                      <button
                        onClick={() =>
                          handleShare(
                            post
                          )
                        }
                        className="flex flex-col items-center gap-1"
                        aria-label="Share"
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
