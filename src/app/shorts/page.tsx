"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  Heart,
  MessageCircle,
  Repeat,
  Share2,
  Volume2,
  VolumeX,
  Loader2,
  Plus,
} from "lucide-react";
import VerifiedBadge from "@/components/VerifiedBadge";
import ShortUploadModal from "@/components/ShortUploadModal";
import { useLanguage } from "@/contexts/LanguageContext";

interface ShortPost {
  id: string;
  content: string;
  imageUrl: string;
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

function getMediaPath(
  url?: string | null
) {
  if (!url) {
    return "";
  }

  return url
    .toLowerCase()
    .split("?")[0]
    .split("#")[0];
}

// ─────────────────────────────────────────────────────────────
// GIF DETECTION
// ─────────────────────────────────────────────────────────────
//
// GIF ALWAYS WINS.
//
// Even if an old database record says:
//
// mediaType = "video"
//
// and the URL ends with:
//
// something.gif
//
// it is STILL a GIF.
//
// A GIF must NEVER be rendered using <video>.
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// REAL VIDEO DETECTION
// ─────────────────────────────────────────────────────────────

function isRealVideoMedia(
  url?: string | null,
  mediaType?: string | null
) {
  /*
   * FIRST CHECK:
   *
   * GIFs are NEVER videos.
   */
  if (
    isGifMedia(
      url,
      mediaType
    )
  ) {
    return false;
  }

  if (!url) {
    return false;
  }

  const path =
    getMediaPath(url);

  // Known video formats.
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
    videoExtensions.some(
      (extension) =>
        path.endsWith(
          extension
        )
    )
  ) {
    return true;
  }

  /*
   * Explicit video type is trusted ONLY
   * after GIF has already been rejected.
   */
  if (
    mediaType?.toLowerCase() ===
    "video"
  ) {
    return true;
  }

  /*
   * Storage URL fallback.
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
// FILTER SHORTS
// ─────────────────────────────────────────────────────────────
//
// This is the final client-side gate.
//
// Only REAL VIDEOS enter the videos state.
//
// GIFs are removed before React ever renders
// a <video> element for them.
// ─────────────────────────────────────────────────────────────

function filterRealVideos(
  posts: ShortPost[]
) {
  if (!Array.isArray(posts)) {
    return [];
  }

  return posts.filter(
    (post) => {
      if (!post) {
        return false;
      }

      if (!post.imageUrl) {
        return false;
      }

      /*
       * HARD GIF BLOCK.
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
       * HARD VIDEO CHECK.
       */
      if (
        !isRealVideoMedia(
          post.imageUrl,
          post.mediaType
        )
      ) {
        return false;
      }

      return true;
    }
  );
}

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export default function ShortsPage() {
  const {
    data: session,
    status,
  } = useSession();

  const router =
    useRouter();

  const { t } = useLanguage();

  const [videos, setVideos] =
    useState<ShortPost[]>(
      []
    );

  const [loading, setLoading] =
    useState(true);

  const [
    nextCursor,
    setNextCursor,
  ] = useState<string | null>(
    null
  );

  const [
    loadingMore,
    setLoadingMore,
  ] = useState(false);

  const [muted, setMuted] =
    useState(true);

  const [
    activeIndex,
    setActiveIndex,
  ] = useState(0);

  const [
    showUpload,
    setShowUpload,
  ] = useState(false);

  const containerRef =
    useRef<HTMLDivElement>(
      null
    );

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
  // DOUBLE TAP
  // ─────────────────────────────────────────────────────────────

  const lastTapRef =
    useRef(0);

  const [
    burstId,
    setBurstId,
  ] = useState<string | null>(
    null
  );

  const [
    burstKey,
    setBurstKey,
  ] = useState(0);

  // ─────────────────────────────────────────────────────────────
  // TOUCH SWIPE
  // ─────────────────────────────────────────────────────────────

  const touchStartY =
    useRef<number | null>(
      null
    );

  // ─────────────────────────────────────────────────────────────
  // AUTH
  // ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (
      status ===
      "unauthenticated"
    ) {
      router.push("/login");
    }
  }, [
    status,
    router,
  ]);

  // ─────────────────────────────────────────────────────────────
  // INITIAL LOAD
  // ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (
      hasFetchedInitial.current ||
      status !==
        "authenticated"
    ) {
      return;
    }

    hasFetchedInitial.current =
      true;

    const load =
      async () => {
        try {
          const res =
            await fetch(
              "/api/videos?limit=8"
            );

          if (res.ok) {
            const data =
              await res.json();

            const rawPosts =
              Array.isArray(
                data.posts
              )
                ? data.posts
                : [];

            /*
             * FINAL CLIENT-SIDE
             * PROTECTION.
             *
             * GIFs are removed here.
             */
            const validVideos =
              filterRealVideos(
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
            "Error loading Shorts:",
            error
          );
        } finally {
          setLoading(
            false
          );
        }
      };

    load();
  }, [status]);

  // ─────────────────────────────────────────────────────────────
  // LOAD MORE
  // ─────────────────────────────────────────────────────────────

  const loadMore =
    useCallback(
      async () => {
        if (
          loadingMore ||
          !nextCursor
        ) {
          return;
        }

        setLoadingMore(
          true
        );

        try {
          const res =
            await fetch(
              `/api/videos?cursor=${encodeURIComponent(
                nextCursor
              )}&limit=8`
            );

          if (res.ok) {
            const data =
              await res.json();

            const rawPosts =
              Array.isArray(
                data.posts
              )
                ? data.posts
                : [];

            /*
             * Filter every new page.
             *
             * Even if an old GIF somehow
             * comes through the API,
             * it cannot enter the Shorts
             * state.
             */
            const validVideos =
              filterRealVideos(
                rawPosts
              );

            setVideos(
              (prev) => {
                const existing =
                  new Set(
                    prev.map(
                      (p) =>
                        p.id
                    )
                  );

                const unique =
                  validVideos.filter(
                    (p) =>
                      !existing.has(
                        p.id
                      )
                  );

                return [
                  ...prev,
                  ...unique,
                ];
              }
            );

            setNextCursor(
              data.nextCursor ||
                null
            );
          }
        } catch (error) {
          console.error(
            "Error loading more Shorts:",
            error
          );
        } finally {
          setLoadingMore(
            false
          );
        }
      },
      [
        loadingMore,
        nextCursor,
      ]
    );

  // ─────────────────────────────────────────────────────────────
  // TRACK ACTIVE VIDEO
  // ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const container =
      containerRef.current;

    if (!container) {
      return;
    }

    const handleScroll =
      () => {
        if (
          container.clientHeight <=
          0
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
  // PLAY ONLY ACTIVE VIDEO
  // ─────────────────────────────────────────────────────────────

  useEffect(() => {
    Object.entries(
      videoRefs.current
    ).forEach(
      ([id, el]) => {
        if (!el) {
          return;
        }

        const activePost =
          videos[
            activeIndex
          ];

        if (
          activePost &&
          id ===
            activePost.id
        ) {
          el.muted =
            muted;

          el.play().catch(
            () => {}
          );
        } else {
          el.pause();
        }
      }
    );
  }, [
    activeIndex,
    videos,
    muted,
  ]);

  // ─────────────────────────────────────────────────────────────
  // KEYBOARD NAVIGATION
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

        container.scrollTo(
          {
            top:
              clamped *
              container.clientHeight,
            behavior:
              "smooth",
          }
        );
      },
      [videos.length]
    );

  useEffect(() => {
    const handleKey =
      (
        e: KeyboardEvent
      ) => {
        if (
          e.key ===
          "ArrowDown"
        ) {
          e.preventDefault();

          scrollToIndex(
            activeIndex + 1
          );
        }

        if (
          e.key ===
          "ArrowUp"
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
    scrollToIndex,
  ]);

  // ─────────────────────────────────────────────────────────────
  // TIME AGO
  // ─────────────────────────────────────────────────────────────

  const timeAgo =
    (
      date: string
    ) => {
      const diff =
        Date.now() -
        new Date(
          date
        ).getTime();

      const minutes =
        Math.floor(
          diff / 60000
        );

      if (
        minutes < 1
      ) {
        return t("notifications.justNow");
      }

      if (
        minutes < 60
      ) {
        return `${minutes}m`;
      }

      const hours =
        Math.floor(
          minutes / 60
        );

      if (
        hours < 24
      ) {
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
    async (
      postId: string
    ) => {
      if (!session) {
        return;
      }

      setVideos(
        (prev) =>
          prev.map(
            (video) =>
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
              method:
                "POST",
            }
          );

        if (!res.ok) {
          setVideos(
            (prev) =>
              prev.map(
                (video) =>
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
          "Error liking Short:",
          error
        );
      }
    };

  // ─────────────────────────────────────────────────────────────
  // REPOST
  // ─────────────────────────────────────────────────────────────

  const handleRepost =
    async (
      postId: string
    ) => {
      if (!session) {
        return;
      }

      try {
        const res =
          await fetch(
            `/api/posts/${postId}/repost`,
            {
              method:
                "POST",
            }
          );

        if (res.ok) {
          const data =
            await res.json();

          setVideos(
            (prev) =>
              prev.map(
                (video) =>
                  video.id ===
                  postId
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
          "Error reposting Short:",
          error
        );
      }
    };

  // ─────────────────────────────────────────────────────────────
  // SHARE
  // ─────────────────────────────────────────────────────────────

  const handleShare =
    async (
      post: ShortPost
    ) => {
      const url =
        `${window.location.origin}/post/${post.id}`;

      if (
        navigator.share
      ) {
        try {
          await navigator.share(
            {
              title:
                t("shorts.sharePostBy", {
                  name:
                    post
                      .author
                      .name ||
                    post
                      .author
                      .username,
                }),
              url,
            }
          );
        } catch {
          // User cancelled.
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
  // UPLOAD
  // ─────────────────────────────────────────────────────────────

  const handleUploaded =
    (
      post: ShortPost
    ) => {
      /*
       * Only accept a newly uploaded
       * item if it is actually a video.
       *
       * This protects the upload callback
       * as well.
       */
      if (
        !isRealVideoMedia(
          post.imageUrl,
          post.mediaType
        )
      ) {
        console.warn(
          "Rejected non-video Short:",
          post.id
        );

        setShowUpload(
          false
        );

        return;
      }

      setVideos(
        (prev) => [
          {
            ...post,
            liked:
              false,
          },
          ...prev,
        ]
      );

      setShowUpload(
        false
      );

      setActiveIndex(
        0
      );

      requestAnimationFrame(
        () => {
          containerRef.current?.scrollTo(
            {
              top: 0,
            }
          );
        }
      );
    };

  // ─────────────────────────────────────────────────────────────
  // LOADING
  // ─────────────────────────────────────────────────────────────

  if (
    status ===
      "loading" ||
    loading
  ) {
    return (
      <div className="fixed inset-0 bg-black z-[100] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black z-[100]">

      {/* BACK */}
      <button
        onClick={() =>
          router.push("/")
        }
        className="absolute top-4 left-4 z-30 text-white bg-black/40 rounded-full p-2 hover:bg-black/60 transition"
        aria-label={t("shorts.back")}
      >
        <ArrowLeft className="w-6 h-6" />
      </button>

      {/* TITLE */}
      <h1 className="absolute top-4 left-1/2 -translate-x-1/2 z-30 text-white font-semibold text-lg">
        Shorts
      </h1>

      {/* TOP RIGHT */}
      <div className="absolute top-4 right-4 z-30 flex items-center gap-2">

        <button
          onClick={() =>
            setShowUpload(
              true
            )
          }
          className="text-white bg-black/40 rounded-full p-2 hover:bg-black/60 transition"
          title={t("shorts.postAShort")}
        >
          <Plus className="w-6 h-6" />
        </button>

        {videos.length >
          0 && (
          <button
            onClick={() =>
              setMuted(
                (m) => !m
              )
            }
            className="text-white bg-black/40 rounded-full p-2 hover:bg-black/60 transition"
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
        )}
      </div>

      {/* EMPTY */}
      {videos.length ===
      0 ? (
        <div className="h-full w-full flex flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-white">
            {t("shorts.noShortsYet")}
          </p>

          <button
            onClick={() =>
              setShowUpload(
                true
              )
            }
            className="text-white bg-zrp-red rounded-full px-4 py-2 hover:bg-zrp-darkRed transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {t("shorts.postAShort")}
          </button>
        </div>
      ) : (
        <div
          ref={
            containerRef
          }
          className="h-full w-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
          style={{
            scrollbarWidth:
              "none",
          }}
          onTouchStart={(
            e
          ) => {
            touchStartY.current =
              e.touches[0].clientY;
          }}
          onTouchEnd={(
            e
          ) => {
            if (
              touchStartY.current ===
              null
            ) {
              return;
            }

            const deltaY =
              touchStartY.current -
              e.changedTouches[0]
                .clientY;

            touchStartY.current =
              null;

            if (
              Math.abs(
                deltaY
              ) > 50
            ) {
              scrollToIndex(
                activeIndex +
                  (deltaY >
                  0
                    ? 1
                    : -1)
              );
            }
          }}
        >

          {videos.map(
            (
              post,
              index
            ) => {

              /*
               * FINAL RENDER PROTECTION.
               *
               * If anything somehow bypassed
               * filterRealVideos(), do not
               * render it.
               */
              if (
                !isRealVideoMedia(
                  post.imageUrl,
                  post.mediaType
                )
              ) {
                return null;
              }

              return (
                <div
                  key={
                    post.id
                  }
                  className="relative h-full w-full snap-start snap-always flex items-center justify-center"
                >

                  {/* REAL VIDEO ONLY */}
                  <video
                    ref={(
                      el
                    ) => {
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
                    controls={
                      false
                    }
                    onClick={(
                      e
                    ) => {
                      const now =
                        Date.now();

                      const isDoubleTap =
                        now -
                          lastTapRef.current <
                        300;

                      lastTapRef.current =
                        now;

                      if (
                        isDoubleTap
                      ) {
                        if (
                          !post.liked
                        ) {
                          handleLike(
                            post.id
                          );
                        }

                        setBurstId(
                          post.id
                        );

                        setBurstKey(
                          (
                            key
                          ) =>
                            key +
                            1
                        );

                        window.setTimeout(
                          () => {
                            setBurstId(
                              (
                                id
                              ) =>
                                id ===
                                post.id
                                  ? null
                                  : id
                            );
                          },
                          700
                        );

                        return;
                      }

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
                    onError={() => {
                      /*
                       * If a supposedly valid
                       * video cannot be loaded,
                       * remove it from Shorts.
                       */
                      setVideos(
                        (
                          prev
                        ) =>
                          prev.filter(
                            (
                              item
                            ) =>
                              item.id !==
                              post.id
                          )
                      );
                    }}
                  />

                  {/* HEART BURST */}
                  {burstId ===
                    post.id && (
                    <div
                      key={
                        burstKey
                      }
                      className="shorts-heart-burst absolute inset-0 flex items-center justify-center pointer-events-none"
                    >
                      <Heart className="w-24 h-24 text-white fill-red-500 drop-shadow-lg" />
                    </div>
                  )}

                  {/* BOTTOM OVERLAY */}
                  <div className="absolute inset-x-0 bottom-0 p-4 pb-8 bg-gradient-to-t from-black/70 via-black/20 to-transparent">

                    <div className="flex items-end justify-between gap-4">

                      {/* AUTHOR */}
                      <div className="flex-1 min-w-0 text-white">

                        <Link
                          href={`/profile/${post.author.username}`}
                          className="flex items-center gap-2 mb-2"
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

                      {/* ACTIONS */}
                      <div className="flex flex-col items-center gap-4 flex-shrink-0 text-white">

                        {/* LIKE */}
                        <button
                          onClick={() =>
                            handleLike(
                              post.id
                            )
                          }
                          className="flex flex-col items-center gap-1"
                          aria-label={t("shorts.like")}
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
      )}

      {/* UPLOAD */}
      {showUpload && (
        <ShortUploadModal
          onClose={() =>
            setShowUpload(
              false
            )
          }
          onUploaded={
            handleUploaded
          }
        />
      )}

      {/* HEART ANIMATION */}
      <style jsx>{`
        .shorts-heart-burst {
          animation: heartBurst 0.7s ease-out forwards;
          z-index: 5;
        }

        @keyframes heartBurst {
          0% {
            opacity: 0;
            transform: scale(0.4);
          }

          25% {
            opacity: 1;
            transform: scale(1.15);
          }

          40% {
            transform: scale(1);
          }

          100% {
            opacity: 0;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
}
