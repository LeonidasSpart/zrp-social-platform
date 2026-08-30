"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Heart,
  MessageCircle,
  Repeat,
  Share2,
  Pencil,
  Trash2,
  Flag,
  Bookmark,
  BarChart3,
  Pin,
  PinOff,
  X,
  ZoomIn,
  Plus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  FileText,
  Globe,
  Loader2,
  Play,
  Volume2,
  VolumeX,
  MapPin,
  ExternalLink,
  Quote,
} from "lucide-react";
import { useSession } from "next-auth/react";
import Comments from "./Comments";
import EditPostModal from "./EditPostModal";
import ReportModal from "./ReportModal";
import VerifiedBadge from "./VerifiedBadge";
import dynamic from "next/dynamic";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), {
  ssr: false,
});

import QuotePostModal from "./QuotePostModal";
import VideoFeedViewer from "./VideoFeedViewer";
import LinkPreviewCard from "./LinkPreviewCard";
import { useLanguage } from "@/contexts/LanguageContext";

interface PostCardProps {
  post: {
    id: string;
    content: string;
    imageUrl?: string;
    imageUrls?: string[];
    mediaType?: string;
    linkUrl?: string | null;
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

    _count?: {
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

    // Original post referenced by a quote post.
    // Kept optional so older API responses remain safe.
    quotePost?: {
      id: string;
      content: string;
      imageUrl?: string | null;
      imageUrls?: string[];
      mediaType?: string | null;
      createdAt: string;
      author: {
        id: string;
        username: string;
        name: string | null;
        avatarUrl?: string | null;
        badgeType?: string | null;
      };
    } | null;
  };

  onUpdate: (deletedPostId?: string) => void;

  showPinOption?: boolean;
  isPinned?: boolean;
  onPinToggle?: () => void;
  showInlineComments?: boolean;
}

// ─────────────────────────────────────────────────────────────
// CONTENT PARSER
// ─────────────────────────────────────────────────────────────

function parseContent(content: string) {
  const parts: {
    type: "text" | "hashtag" | "mention" | "url";
    value: string;
  }[] = [];

  let lastIndex = 0;

  const regex =
    /(@\w+)|(#\w+)|(https?:\/\/[^\s]+)|(www\.[^\s]+)/g;

  const trailingPunctuation = /[.,!?;:'")\]}]+$/;

  let match;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        value: content.slice(lastIndex, match.index),
      });
    }

    const raw = match[0];

    const type: "hashtag" | "mention" | "url" =
      raw.startsWith("@")
        ? "mention"
        : raw.startsWith("#")
          ? "hashtag"
          : "url";

    if (type === "url") {
      const trailingMatch = raw.match(trailingPunctuation);

      const trimmed = trailingMatch
        ? raw.slice(0, raw.length - trailingMatch[0].length)
        : raw;

      if (trailingMatch && trimmed.length > 0) {
        parts.push({
          type: "url",
          value: trimmed,
        });

        parts.push({
          type: "text",
          value: trailingMatch[0],
        });

        lastIndex = match.index + raw.length;
        continue;
      }
    }

    parts.push({
      type,
      value: raw,
    });

    lastIndex = match.index + raw.length;
  }

  if (lastIndex < content.length) {
    parts.push({
      type: "text",
      value: content.slice(lastIndex),
    });
  }

  return parts;
}

// ─────────────────────────────────────────────────────────────
// EXTRACT FIRST URL
// ─────────────────────────────────────────────────────────────

function extractFirstUrl(content: string): string | null {
  const match = content.match(
    /(https?:\/\/[^\s]+)|(www\.[^\s]+)/
  );

  if (!match) return null;

  const raw = match[0].replace(
    /[.,!?;:'")\]}]+$/,
    ""
  );

  return raw.startsWith("http") ? raw : `https://${raw}`;
}

// ─────────────────────────────────────────────────────────────
// FORMAT COUNTS
// ─────────────────────────────────────────────────────────────

function formatCount(n: number) {
  if (n >= 1_000_000) {
    return (
      (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M"
    );
  }

  if (n >= 1_000) {
    return (
      (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K"
    );
  }

  return n.toString();
}

// ─────────────────────────────────────────────────────────────
// MEDIA HELPERS
// ─────────────────────────────────────────────────────────────

function normalizeMediaType(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function getMediaPath(url?: string | null) {
  if (!url) return "";

  return url
    .toLowerCase()
    .split("?")[0]
    .split("#")[0];
}

function isGifMedia(
  url?: string | null,
  mediaType?: string | null
) {
  const type = normalizeMediaType(mediaType);
  const path = getMediaPath(url);

  return (
    path.endsWith(".gif") ||
    type === "gif" ||
    type === "image/gif"
  );
}

function isExplicitVideoMediaType(
  mediaType?: string | null
) {
  const type = normalizeMediaType(mediaType);

  return (
    type === "video" ||
    type === "videos" ||
    type === "movie" ||
    type === "video/mp4" ||
    type === "video/webm" ||
    type === "video/mov" ||
    type === "video/quicktime" ||
    type.startsWith("video/")
  );
}

function isExplicitImageMediaType(
  mediaType?: string | null
) {
  const type = normalizeMediaType(mediaType);

  return (
    type === "image" ||
    type === "images" ||
    type === "photo" ||
    type === "picture" ||
    type.startsWith("image/")
  );
}

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export default function PostCard({
  post,
  onUpdate,
  showPinOption = false,
  isPinned = false,
  onPinToggle,
  showInlineComments = true,
}: PostCardProps) {
  const { data: session } = useSession();
  const { language: uiLanguage } = useLanguage();

  const [liked, setLiked] = useState(post.liked || false);

  const [likesCount, setLikesCount] = useState(
    post._count?.likes || 0
  );

  const [commentsCount, setCommentsCount] = useState(
    post._count?.comments || 0
  );

  const [linkPreviewFoundFor, setLinkPreviewFoundFor] =
    useState<string | null>(null);

  const [showComments, setShowComments] = useState(false);

  const [reposted, setReposted] = useState(false);

  const [repostsCount, setRepostsCount] = useState(
    post._count?.reposts || 0
  );

  const [viewsCount, setViewsCount] = useState(
    post.views || 0
  );

  const [showEditModal, setShowEditModal] =
    useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] =
    useState(false);

  const [showReportModal, setShowReportModal] =
    useState(false);

  const [deleting, setDeleting] = useState(false);

  const [pinLoading, setPinLoading] = useState(false);

  const [bookmarked, setBookmarked] = useState(false);

  const [bookmarkLoading, setBookmarkLoading] =
    useState(false);

  const hasCountedView = useRef(false);

  const [repostDropdownOpen, setRepostDropdownOpen] =
    useState(false);

  const [showQuoteModal, setShowQuoteModal] =
    useState(false);

  const [lastClickTime, setLastClickTime] =
    useState(0);

  // ─────────────────────────────────────────────────────────────
  // IMAGE LIGHTBOX
  // ─────────────────────────────────────────────────────────────

  const [lightboxImageIndex, setLightboxImageIndex] =
    useState<number | null>(null);

  const [reactions, setReactions] =
    useState<Record<string, number>>({});

  const [userReaction, setUserReaction] =
    useState<string | null>(null);

  const [reactionsLoading, setReactionsLoading] =
    useState(true);

  const [showEmojiPicker, setShowEmojiPicker] =
    useState(false);

  const [articleExpanded, setArticleExpanded] =
    useState(false);

  const [contentExpanded, setContentExpanded] =
    useState(false);

  const [translatedText, setTranslatedText] =
    useState<string | null>(null);

  const [showTranslation, setShowTranslation] =
    useState(false);

  const [translating, setTranslating] =
    useState(false);

  const [translateError, setTranslateError] =
    useState(false);

  const isAuthor =
    session?.user?.id === post.author.id;

  const contentParts = parseContent(post.content);

  const CONTENT_TRUNCATE_LENGTH = 280;

  const isLongContent =
    post.content.length > CONTENT_TRUNCATE_LENGTH;

  const displayContentParts =
    isLongContent && !contentExpanded
      ? parseContent(
          post.content.slice(
            0,
            CONTENT_TRUNCATE_LENGTH
          )
        )
      : contentParts;

  const previewUrl =
    post.linkUrl ||
    extractFirstUrl(post.content);

  const isRepost = post.isRepost === true;

  const originalAuthor =
    post.repostOriginalAuthor;

  const commentsEnabled =
    post.commentsEnabled !== false;

  const postType =
    post.type || "POST";

  // Plain-text rendering of the article body's sanitized HTML, used
  // only for the collapsed preview so truncation can't cut a tag in
  // half and leave broken markup on the page.
  const articlePreviewText =
    postType === "ARTICLE" &&
    post.body
      ? post.body
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      : "";

  // ─────────────────────────────────────────────────────────────
  // IMAGE GALLERY
  // ─────────────────────────────────────────────────────────────

  const galleryImages =
    post.imageUrls &&
    post.imageUrls.length > 0
      ? post.imageUrls
      : post.imageUrl
        ? [post.imageUrl]
        : [];

  const lightboxOpen =
    lightboxImageIndex !== null &&
    galleryImages.length > 0 &&
    !!galleryImages[lightboxImageIndex];

  const closeLightbox = () => {
    setLightboxImageIndex(null);
  };

  const openLightbox = (index: number) => {
    if (
      index < 0 ||
      index >= galleryImages.length
    ) {
      return;
    }

    setLightboxImageIndex(index);
  };

  const showPreviousLightboxImage = () => {
    if (lightboxImageIndex === null) {
      return;
    }

    setLightboxImageIndex((current) => {
      if (current === null) return null;

      return current > 0
        ? current - 1
        : galleryImages.length - 1;
    });
  };

  const showNextLightboxImage = () => {
    if (lightboxImageIndex === null) {
      return;
    }

    setLightboxImageIndex((current) => {
      if (current === null) return null;

      return current < galleryImages.length - 1
        ? current + 1
        : 0;
    });
  };

  // ─────────────────────────────────────────────────────────────
  // LIGHTBOX SCROLL LOCK
  // ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!lightboxOpen) return;

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow =
        previousOverflow;
    };
  }, [lightboxOpen]);

  // ─────────────────────────────────────────────────────────────
  // LIGHTBOX KEYBOARD
  // ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!lightboxOpen) return;

    const handleKeyDown = (
      event: KeyboardEvent
    ) => {
      if (event.key === "Escape") {
        closeLightbox();
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        showPreviousLightboxImage();
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        showNextLightboxImage();
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    lightboxOpen,
    lightboxImageIndex,
    galleryImages.length,
  ]);

  // ─────────────────────────────────────────────────────────────
  // LIGHTBOX TOUCH
  // ─────────────────────────────────────────────────────────────

  const lightboxTouchStartX =
    useRef<number | null>(null);

  const lightboxTouchStartY =
    useRef<number | null>(null);

  const handleLightboxTouchStart = (
    event: React.TouchEvent
  ) => {
    const touch = event.touches[0];

    if (!touch) return;

    lightboxTouchStartX.current =
      touch.clientX;

    lightboxTouchStartY.current =
      touch.clientY;
  };

  const handleLightboxTouchEnd = (
    event: React.TouchEvent
  ) => {
    if (
      lightboxTouchStartX.current === null ||
      lightboxTouchStartY.current === null
    ) {
      return;
    }

    const touch = event.changedTouches[0];

    if (!touch) return;

    const deltaX =
      touch.clientX -
      lightboxTouchStartX.current;

    const deltaY =
      touch.clientY -
      lightboxTouchStartY.current;

    lightboxTouchStartX.current = null;
    lightboxTouchStartY.current = null;

    if (
      Math.abs(deltaX) < 50 ||
      Math.abs(deltaX) <= Math.abs(deltaY)
    ) {
      return;
    }

    if (deltaX < 0) {
      showNextLightboxImage();
    } else {
      showPreviousLightboxImage();
    }
  };

  // ─────────────────────────────────────────────────────────────
  // MEDIA DETECTION
  // ─────────────────────────────────────────────────────────────
  //
  // IMPORTANT:
  //
  // GIF ALWAYS = IMAGE
  //
  // Video detection is intentionally based on BOTH:
  //
  // 1. URL extension
  // 2. database mediaType
  //
  // This is important because storage/CDN URLs often look like:
  //
  // https://cdn.example.com/file/abc123
  //
  // instead of:
  //
  // https://cdn.example.com/file/video.mp4
  //
  // If the API says mediaType = video, we therefore still
  // render the media as a video and allow Shorts.
  //
  // ─────────────────────────────────────────────────────────────

  const mediaUrl =
    post.imageUrl || "";

  const mediaPath =
    getMediaPath(mediaUrl);

  const normalizedMediaType =
    normalizeMediaType(post.mediaType);

  const isGif =
    isGifMedia(
      post.imageUrl,
      post.mediaType
    );

  const isImageGallery =
    !!post.imageUrls &&
    post.imageUrls.length > 1;

  const imageExtensions = [
    "jpg",
    "jpeg",
    "png",
    "gif",
    "webp",
    "svg",
    "avif",
    "bmp",
    "tif",
    "tiff",
    "heic",
    "heif",
  ];

  const videoExtensions = [
    "mp4",
    "webm",
    "mov",
    "avi",
    "mkv",
    "m4v",
    "3gp",
    "3g2",
    "ogv",
    "mpeg",
    "mpg",
    "m2v",
    "ts",
  ];

  const hasImageExtension =
    imageExtensions.some(
      (ext) =>
        mediaPath.endsWith("." + ext)
    );

  const hasVideoExtension =
    videoExtensions.some(
      (ext) =>
        mediaPath.endsWith("." + ext)
    );

  /*
   * GIF ALWAYS wins.
   */
  const video =
    !isGif &&
    !isImageGallery &&
    !isExplicitImageMediaType(
      normalizedMediaType
    ) &&
    (
      isExplicitVideoMediaType(
        normalizedMediaType
      ) ||
      hasVideoExtension ||
      (
        !hasImageExtension &&
        (
          mediaUrl.includes("/video/") ||
          mediaUrl.includes("/videos/") ||
          mediaUrl.includes("/media/video/") ||
          mediaUrl.includes("/uploads/video/") ||
          mediaUrl.includes("video=true")
        )
      )
    );

  const [videoLoadFailed, setVideoLoadFailed] =
    useState(false);

  const videoRef =
    useRef<HTMLVideoElement>(null);

  const [showVideoFeed, setShowVideoFeed] =
    useState(false);

  const posterNudged = useRef(false);

  const nudgeVideoFrame = (
    el: HTMLVideoElement
  ) => {
    if (posterNudged.current) return;

    posterNudged.current = true;

    try {
      if (Number.isFinite(el.duration)) {
        el.currentTime = Math.min(
          0.1,
          (el.duration || 1) * 0.05
        );
      }
    } catch {
      // no-op
    }
  };

  const videoContainerRef =
    useRef<HTMLDivElement>(null);

  const [videoInView, setVideoInView] =
    useState(false);

  const [videoMuted, setVideoMuted] =
    useState(true);

  // Reset media state if a reused PostCard receives
  // a completely different media URL.
  useEffect(() => {
    setVideoLoadFailed(false);
    setVideoInView(false);
    setVideoMuted(true);
    posterNudged.current = false;
  }, [
    post.id,
    post.imageUrl,
    post.mediaType,
  ]);

  // ─────────────────────────────────────────────────────────────
  // VIDEO AUTOPLAY
  // ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (
      !video ||
      !videoContainerRef.current
    ) {
      return;
    }

    const el =
      videoContainerRef.current;

    const observer =
      new IntersectionObserver(
        ([entry]) => {
          setVideoInView(
            entry.isIntersecting
          );
        },
        {
          threshold: 0.6,
        }
      );

    observer.observe(el);

    return () =>
      observer.disconnect();
  }, [
    video,
    post.id,
  ]);

  useEffect(() => {
    const el =
      videoRef.current;

    if (!el || !video) return;

    if (videoInView) {
      el.muted = videoMuted;

      const playPromise =
        el.play();

      if (playPromise) {
        playPromise.catch(() => {});
      }
    } else {
      el.pause();
    }
  }, [
    video,
    videoInView,
    videoMuted,
  ]);

  // ─────────────────────────────────────────────────────────────
  // REPOST STATUS
  // ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const checkRepost = async () => {
      if (!session) return;

      try {
        const res =
          await fetch(
            `/api/posts/${post.id}/repost`
          );

        if (res.ok) {
          const data =
            await res.json();

          setReposted(
            data.reposted
          );
        }
      } catch (error) {
        console.error(
          "Error checking repost:",
          error
        );
      }
    };

    checkRepost();
  }, [
    post.id,
    session,
  ]);

  // ─────────────────────────────────────────────────────────────
  // REACTIONS
  // ─────────────────────────────────────────────────────────────

  const fetchReactions =
    async () => {
      try {
        const res =
          await fetch(
            `/api/posts/${post.id}/reaction`
          );

        if (res.ok) {
          const data =
            await res.json();

          const counts =
            data.reduce(
              (
                acc: Record<string, number>,
                r: any
              ) => {
                acc[r.emoji] =
                  (acc[r.emoji] || 0) + 1;

                return acc;
              },
              {}
            );

          setReactions(counts);

          const ownReaction =
            data.find(
              (r: any) =>
                r.user.id ===
                session?.user?.id
            )?.emoji || null;

          setUserReaction(
            ownReaction
          );
        }
      } catch (error) {
        console.error(
          "Error fetching reactions:",
          error
        );
      } finally {
        setReactionsLoading(false);
      }
    };

  useEffect(() => {
    if (session) {
      fetchReactions();
    }
  }, [
    post.id,
    session,
  ]);

  const handleReaction =
    async (emoji: string) => {
      if (!session) return;

      try {
        const res =
          await fetch(
            `/api/posts/${post.id}/reaction`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                emoji,
              }),
            }
          );

        if (res.ok) {
          await fetchReactions();
          setShowEmojiPicker(false);
        }
      } catch (error) {
        console.error(
          "Error toggling reaction:",
          error
        );
      }
    };

  // ─────────────────────────────────────────────────────────────
  // BOOKMARK CHECK
  // ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const checkBookmark =
      async () => {
        try {
          const res =
            await fetch(
              `/api/posts/${post.id}/bookmark`
            );

          if (res.ok) {
            const data =
              await res.json();

            setBookmarked(
              data.bookmarked
            );
          }
        } catch (error) {
          console.error(
            "Error checking bookmark:",
            error
          );
        }
      };

    if (session) {
      checkBookmark();
    }
  }, [
    post.id,
    session,
  ]);

  // ─────────────────────────────────────────────────────────────
  // VIEW COUNT
  // ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (hasCountedView.current) return;

    hasCountedView.current = true;

    const storageKey =
      "zrp_viewed_posts";

    let viewed: string[] = [];

    try {
      viewed = JSON.parse(
        sessionStorage.getItem(
          storageKey
        ) || "[]"
      );
    } catch {
      viewed = [];
    }

    if (viewed.includes(post.id)) {
      return;
    }

    fetch(
      `/api/posts/${post.id}/view`,
      {
        method: "POST",
      }
    )
      .then((res) =>
        res.ok
          ? res.json()
          : null
      )
      .then((data) => {
        if (data?.views != null) {
          setViewsCount(
            data.views
          );
        } else {
          setViewsCount(
            (v) => v + 1
          );
        }
      })
      .catch(() => {});

    viewed.push(post.id);

    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify(
          viewed.slice(-500)
        )
      );
    } catch {}
  }, [post.id]);

  // ─────────────────────────────────────────────────────────────
  // COMMENTS
  // ─────────────────────────────────────────────────────────────

  const handleCommentCountChange =
    (delta?: number) => {
      setCommentsCount(
        (prev) =>
          Math.max(
            0,
            prev + (delta || 0)
          )
      );
    };

  // ─────────────────────────────────────────────────────────────
  // LIKE
  // ─────────────────────────────────────────────────────────────

  const handleLike =
    async () => {
      try {
        const res =
          await fetch(
            `/api/posts/${post.id}/like`,
            {
              method: "POST",
            }
          );

        if (res.ok) {
          setLiked(!liked);

          setLikesCount(
            liked
              ? Math.max(
                  0,
                  likesCount - 1
                )
              : likesCount + 1
          );
        }
      } catch (error) {
        console.error(
          "Error liking post:",
          error
        );
      }
    };

  // ─────────────────────────────────────────────────────────────
  // REPOST
  // ─────────────────────────────────────────────────────────────

  const handleRepost =
    async () => {
      try {
        const res =
          await fetch(
            `/api/posts/${post.id}/repost`,
            {
              method: "POST",
            }
          );

        if (res.ok) {
          const data =
            await res.json();

          setReposted(
            data.reposted
          );

          setRepostsCount(
            data.reposted
              ? repostsCount + 1
              : Math.max(
                  0,
                  repostsCount - 1
                )
          );
        }
      } catch (error) {
        console.error(
          "Error reposting post:",
          error
        );
      }
    };

  // ─────────────────────────────────────────────────────────────
  // SHARE
  // ─────────────────────────────────────────────────────────────

  const handleShare =
    async () => {
      const url =
        window.location.href;

      if (navigator.share) {
        try {
          await navigator.share({
            title: `Post by ${
              post.author.name ||
              post.author.username
            }`,
            text: post.content,
            url,
          });
        } catch {}
      } else {
        try {
          await navigator.clipboard.writeText(
            url
          );

          alert(
            "Link copied to clipboard!"
          );
        } catch {}
      }
    };

  // ─────────────────────────────────────────────────────────────
  // DELETE
  // ─────────────────────────────────────────────────────────────

  const handleDelete =
    async () => {
      setDeleting(true);

      try {
        const res =
          await fetch(
            `/api/posts/${post.id}`,
            {
              method: "DELETE",
            }
          );

        if (res.ok) {
          onUpdate(post.id);
          setShowDeleteConfirm(false);
        } else {
          // Surface the server's actual error text (Unauthorized, Post
          // not found, etc.) instead of always showing the same generic
          // message regardless of what actually went wrong - that was
          // making a 401/403/404 indistinguishable from a real 500 from
          // this UI alone.
          let message = "Failed to delete post";
          try {
            const data = await res.json();
            if (data?.error) message = `Failed to delete post: ${data.error}`;
          } catch {
            // Body wasn't JSON - fall back to the generic message.
          }
          alert(message);
        }
      } catch (error) {
        console.error(
          "Error deleting post:",
          error
        );

        alert(
          "Failed to delete post"
        );
      } finally {
        setDeleting(false);
      }
    };

  // ─────────────────────────────────────────────────────────────
  // REPORT
  // ─────────────────────────────────────────────────────────────

  const handleReport =
    async (
      reason: string,
      details?: string
    ) => {
      try {
        const res =
          await fetch(
            "/api/reports",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                postId: post.id,
                reason,
                details,
              }),
            }
          );

        if (res.ok) {
          alert(
            "Report submitted. Thank you for helping keep the community safe."
          );

          setShowReportModal(false);
        } else {
          const err =
            await res
              .json()
              .catch(
                () => ({})
              );

          alert(
            err.error ||
              "Failed to submit report. Please try again."
          );

          if (res.status === 409) {
            setShowReportModal(false);
          }
        }
      } catch (error) {
        console.error(
          "Report error:",
          error
        );

        alert(
          "Failed to submit report. Please try again."
        );
      }
    };

  // ─────────────────────────────────────────────────────────────
  // BOOKMARK
  // ─────────────────────────────────────────────────────────────

  const handleBookmark =
    async () => {
      setBookmarkLoading(true);

      try {
        const res =
          await fetch(
            `/api/posts/${post.id}/bookmark`,
            {
              method: "POST",
            }
          );

        if (res.ok) {
          const data =
            await res.json();

          setBookmarked(
            data.bookmarked
          );
        }
      } catch (error) {
        console.error(
          "Error toggling bookmark:",
          error
        );
      } finally {
        setBookmarkLoading(false);
      }
    };

  // ─────────────────────────────────────────────────────────────
  // PIN
  // ─────────────────────────────────────────────────────────────

  const handlePinToggle =
    async () => {
      setPinLoading(true);

      try {
        const res =
          await fetch(
            `/api/posts/${post.id}/pin`,
            {
              method: "POST",
            }
          );

        if (res.ok) {
          onPinToggle?.();
        } else {
          alert(
            "Failed to update pin status"
          );
        }
      } catch (error) {
        console.error(
          "Pin toggle error:",
          error
        );

        alert(
          "Failed to update pin status"
        );
      } finally {
        setPinLoading(false);
      }
    };

  // ─────────────────────────────────────────────────────────────
  // TRANSLATE
  // ─────────────────────────────────────────────────────────────

  const handleTranslate =
    async () => {
      if (translatedText) {
        setShowTranslation(
          !showTranslation
        );

        return;
      }

      setTranslating(true);
      setTranslateError(false);

      try {
        const res =
          await fetch(
            "/api/translate",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                text: post.content,
                targetLang:
                  uiLanguage,
              }),
            }
          );

        if (res.ok) {
          const data =
            await res.json();

          setTranslatedText(
            data.translatedText
          );

          setShowTranslation(true);
        } else {
          setTranslateError(true);
        }
      } catch (error) {
        console.error(
          "Translate error:",
          error
        );

        setTranslateError(true);
      } finally {
        setTranslating(false);
      }
    };

  // ─────────────────────────────────────────────────────────────
  // DOUBLE CLICK LIKE
  // ─────────────────────────────────────────────────────────────

  const handlePostClick =
    (e: React.MouseEvent) => {
      const now = Date.now();

      const timeSince =
        now - lastClickTime;

      setLastClickTime(now);

      if (timeSince < 300) {
        handleLike();
      }
    };

  const lastTouchTimeRef =
    useRef(0);

  const handleTouchEnd =
    () => {
      const now = Date.now();

      const timeSince =
        now -
        lastTouchTimeRef.current;

      lastTouchTimeRef.current =
        now;

      if (timeSince < 300) {
        handleLike();
      }
    };

  // ─────────────────────────────────────────────────────────────
  // TIME AGO
  // ─────────────────────────────────────────────────────────────

  const timeAgo =
    (date: string) => {
      const diff =
        Date.now() -
        new Date(date).getTime();

      const minutes =
        Math.floor(
          diff / 60000
        );

      if (minutes < 1)
        return "Just now";

      if (minutes < 60)
        return `${minutes}m`;

      const hours =
        Math.floor(
          minutes / 60
        );

      if (hours < 24)
        return `${hours}h`;

      const days =
        Math.floor(
          hours / 24
        );

      return `${days}d`;
    };

  const getInitial =
    () => {
      const name =
        post.author.name ||
        post.author.username ||
        "?";

      return name
        .charAt(0)
        .toUpperCase();
    };

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────

  return (
    <>
      <div className="bg-white dark:bg-zrp-deepBlack px-4 py-3 border-b border-gray-200 dark:border-gray-800 hover:bg-gray-50/70 dark:hover:bg-white/[0.03] transition">
        <div className="flex items-start gap-3">

          {/* AVATAR */}
          <Link
            href={`/profile/${post.author.username}`}
          >
            <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-300 font-semibold flex-shrink-0 overflow-hidden">
              {post.author.avatarUrl ? (
                <img
                  src={post.author.avatarUrl}
                  alt={
                    post.author.name ||
                    post.author.username
                  }
                  className="w-full h-full object-cover"
                />
              ) : (
                getInitial()
              )}
            </div>
          </Link>

          <div className="flex-1 min-w-0">

            {/* HEADER */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">

                <Link
                  href={`/profile/${post.author.username}`}
                >
                  <span className="font-semibold hover:underline text-gray-900 dark:text-white inline-flex items-center gap-1">
                    {post.author.name ||
                      post.author.username}

                    <VerifiedBadge
                      badgeType={
                        post.author.badgeType
                      }
                    />
                  </span>
                </Link>

                <Link
                  href={`/profile/${post.author.username}`}
                >
                  <span className="text-gray-500 dark:text-gray-400 text-sm hover:underline">
                    @{post.author.username}
                  </span>
                </Link>

                <span className="text-gray-400 dark:text-gray-500 text-sm">
                  ·
                </span>

                <span className="text-gray-400 dark:text-gray-500 text-sm">
                  {timeAgo(
                    post.createdAt
                  )}
                </span>

                {postType ===
                  "RECRUITMENT" && (
                  <span className="inline-flex items-center gap-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                    <Briefcase className="w-3 h-3" />
                    Recruitment
                  </span>
                )}

                {postType ===
                  "ARTICLE" && (
                  <span className="inline-flex items-center gap-1 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full">
                    <FileText className="w-3 h-3" />
                    Article
                  </span>
                )}
              </div>

              {isAuthor ? (
                <div className="flex items-center gap-1">

                  {showPinOption && (
                    <button
                      onClick={
                        handlePinToggle
                      }
                      disabled={
                        pinLoading
                      }
                      className={`transition p-1 ${
                        isPinned
                          ? "text-blue-500 hover:text-blue-600"
                          : "text-gray-400 hover:text-blue-500"
                      }`}
                      title={
                        isPinned
                          ? "Unpin from profile"
                          : "Pin to profile"
                      }
                    >
                      {isPinned ? (
                        <PinOff className="w-4 h-4" />
                      ) : (
                        <Pin className="w-4 h-4" />
                      )}
                    </button>
                  )}

                  <button
                    onClick={() =>
                      setShowEditModal(
                        true
                      )
                    }
                    className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition p-1"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() =>
                      setShowDeleteConfirm(
                        true
                      )
                    }
                    className="text-gray-400 hover:text-red-500 transition p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() =>
                    setShowReportModal(
                      true
                    )
                  }
                  className="text-gray-400 hover:text-red-500 transition p-1"
                >
                  <Flag className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* REPOST INFO */}
            {isRepost &&
              originalAuthor && (
                <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-1">
                  <Repeat className="w-3 h-3" />

                  <span>
                    Reposted from{" "}
                    <Link
                      href={`/profile/${originalAuthor.username}`}
                      className="hover:underline text-zrp-red"
                    >
                      @{originalAuthor.username}
                    </Link>
                  </span>
                </div>
              )}

            {/* POST BODY */}
            <div
              onClick={
                handlePostClick
              }
              onTouchEnd={
                handleTouchEnd
              }
              className="cursor-pointer select-none"
            >
              <p className="text-gray-800 dark:text-gray-200 mt-1 whitespace-pre-wrap break-words">
                {displayContentParts.map(
                  (
                    part,
                    index
                  ) => {
                    if (
                      part.type ===
                      "hashtag"
                    ) {
                      const tag =
                        part.value.slice(
                          1
                        );

                      return (
                        <Link
                          key={
                            index
                          }
                          href={`/hashtag/${tag}`}
                          className="text-zrp-red hover:underline"
                        >
                          {
                            part.value
                          }
                        </Link>
                      );
                    }

                    if (
                      part.type ===
                      "mention"
                    ) {
                      const username =
                        part.value.slice(
                          1
                        );

                      return (
                        <Link
                          key={
                            index
                          }
                          href={`/profile/${username}`}
                          className="text-zrp-red hover:underline"
                        >
                          {
                            part.value
                          }
                        </Link>
                      );
                    }

                    if (
                      part.type ===
                      "url"
                    ) {
                      const href =
                        part.value.startsWith(
                          "http"
                        )
                          ? part.value
                          : `https://${part.value}`;

                      if (
                        previewUrl &&
                        href ===
                          previewUrl &&
                        linkPreviewFoundFor ===
                          previewUrl
                      ) {
                        return null;
                      }

                      return (
                        <a
                          key={
                            index
                          }
                          href={
                            href
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(
                            e
                          ) =>
                            e.stopPropagation()
                          }
                          className="text-zrp-red hover:underline break-all"
                        >
                          {
                            part.value
                          }
                        </a>
                      );
                    }

                    return (
                      <span
                        key={
                          index
                        }
                      >
                        {
                          part.value
                        }
                      </span>
                    );
                  }
                )}

                {isLongContent &&
                  !contentExpanded &&
                  "..."}
              </p>

              {/* SHOW MORE */}
              {isLongContent && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();

                    setContentExpanded(
                      !contentExpanded
                    );
                  }}
                  className="text-sm text-zrp-red hover:underline mt-0.5"
                >
                  {contentExpanded
                    ? "Show less"
                    : "Show more"}
                </button>
              )}

              {/* QUOTED ORIGINAL POST */}
              {post.quotePost && (
                <div
                  role="link"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    window.location.href = `/post/${post.quotePost!.id}`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      window.location.href = `/post/${post.quotePost!.id}`;
                    }
                  }}
                  className="mt-3 rounded-2xl border border-gray-300 dark:border-gray-700 bg-gray-50/80 dark:bg-white/[0.035] p-3 sm:p-4 cursor-pointer hover:bg-gray-100/80 dark:hover:bg-white/[0.06] transition-colors focus:outline-none focus:ring-2 focus:ring-zrp-red/60"
                  aria-label={`Quoted post by @${post.quotePost.author.username}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Quote className="w-4 h-4 text-zrp-red flex-shrink-0" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-zrp-red">
                      Quoted post
                    </span>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {post.quotePost.author.avatarUrl ? (
                        <img
                          src={post.quotePost.author.avatarUrl}
                          alt={post.quotePost.author.name || post.quotePost.author.username}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                          {(post.quotePost.author.name || post.quotePost.author.username).charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-sm text-gray-900 dark:text-white">
                          {post.quotePost.author.name || post.quotePost.author.username}
                        </span>
                        <VerifiedBadge badgeType={post.quotePost.author.badgeType} />
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          @{post.quotePost.author.username}
                        </span>
                      </div>

                      <p className="mt-1 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words line-clamp-6">
                        {post.quotePost.content}
                      </p>

                      {(post.quotePost.imageUrl || post.quotePost.imageUrls?.length) && (
                        <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                          <img
                            src={post.quotePost.imageUrl || post.quotePost.imageUrls?.[0] || ""}
                            alt="Quoted post media"
                            className="w-full max-h-72 object-cover"
                            loading="lazy"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* LINK PREVIEW */}
              {!post.imageUrl &&
                previewUrl && (
                  <LinkPreviewCard
                    url={
                      previewUrl
                    }
                    onLoaded={(
                      found
                    ) =>
                      setLinkPreviewFoundFor(
                        found
                          ? previewUrl
                          : null
                      )
                    }
                  />
                )}

              {/* TRANSLATION */}
              {post.content
                .trim()
                .length > 0 && (
                <div
                  className="mt-1"
                  onClick={(e) =>
                    e.stopPropagation()
                  }
                >
                  <button
                    onClick={
                      handleTranslate
                    }
                    disabled={
                      translating
                    }
                    className="inline-flex items-center gap-1 text-sm text-zrp-red hover:underline disabled:opacity-60"
                  >
                    {translating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Globe className="w-3.5 h-3.5" />
                    )}

                    {showTranslation
                      ? "Show original"
                      : "Show translation"}
                  </button>

                  {translateError && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      Translation unavailable
                      right now.
                    </p>
                  )}

                  {showTranslation &&
                    translatedText && (
                      <p className="text-gray-800 dark:text-gray-200 mt-1.5 whitespace-pre-wrap break-words border-l-2 border-gray-200 dark:border-gray-700 pl-2">
                        {
                          translatedText
                        }
                      </p>
                    )}
                </div>
              )}

              {/* RECRUITMENT */}
              {postType ===
                "RECRUITMENT" &&
                (post.company ||
                  post.location ||
                  post.applyUrl) && (
                  <div className="mt-3 rounded-2xl overflow-hidden border border-blue-100 dark:border-blue-900/40 bg-gradient-to-br from-blue-50/80 to-white dark:from-blue-950/30 dark:to-zrp-deepBlack">

                    <div className="px-4 py-3 border-b border-blue-100 dark:border-blue-900/40 flex items-center gap-2">
                      <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                        <Briefcase className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      </div>

                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white text-sm">
                          Job opportunity
                        </p>

                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Recruitment
                        </p>
                      </div>
                    </div>

                    <div className="px-4 py-3 space-y-2">
                      {post.company && (
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {post.company}
                        </p>
                      )}

                      {post.location && (
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <MapPin className="w-4 h-4 flex-shrink-0" />
                          <span>
                            {post.location}
                          </span>
                        </div>
                      )}

                      {post.applyUrl && (
                        <a
                          href={
                            post.applyUrl
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) =>
                            e.stopPropagation()
                          }
                          className="inline-flex items-center gap-2 mt-2 bg-zrp-red hover:bg-red-700 text-white px-4 py-2 rounded-full text-sm font-semibold transition"
                        >
                          Apply Now
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                )}

              {/* ARTICLE */}
              {postType ===
                "ARTICLE" &&
                post.body && (
                  <div className="mt-3 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">

                    <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-purple-500" />

                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        Article
                      </span>
                    </div>

                    <div className="px-4 py-3">
                      <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-gray-900 dark:prose-headings:text-white prose-p:text-gray-800 dark:prose-p:text-gray-200 prose-strong:text-gray-900 dark:prose-strong:text-white prose-li:text-gray-800 dark:prose-li:text-gray-200 prose-a:text-zrp-red hover:prose-a:underline">
                        {articleExpanded ? (
                          <div
                            dangerouslySetInnerHTML={{
                              __html:
                                post.body,
                            }}
                            className="text-gray-800 dark:text-gray-200"
                          />
                        ) : (
                          <p className="text-gray-800 dark:text-gray-200">
                            {articlePreviewText.slice(
                              0,
                              300
                            ) +
                              (articlePreviewText.length >
                              300
                                ? "..."
                                : "")}
                          </p>
                        )}
                      </div>

                      {articlePreviewText.length >
                        300 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();

                            setArticleExpanded(
                              !articleExpanded
                            );
                          }}
                          className="text-sm text-zrp-red hover:underline mt-2 font-medium"
                        >
                          {articleExpanded
                            ? "Show less"
                            : "Read more"}
                        </button>
                      )}
                    </div>
                  </div>
                )}

              {/* MEDIA */}
              {!video &&
              post.imageUrls &&
              post.imageUrls.length >
                1 ? (
                <div
                  className={`mt-3 rounded-2xl overflow-hidden grid gap-0.5 ${
                    post.imageUrls.length === 2
                      ? "grid-cols-2"
                      : "grid-cols-2 grid-rows-2"
                  }`}
                >
                  {post.imageUrls
                    .slice(0, 4)
                    .map(
                      (
                        url,
                        idx
                      ) => (
                        <div
                          key={url}
                          className={`relative cursor-pointer group bg-gray-100 dark:bg-gray-800 ${
                            post.imageUrls!.length ===
                              3 &&
                            idx === 0
                              ? "row-span-2"
                              : ""
                          }`}
                          onClick={(
                            e
                          ) => {
                            e.stopPropagation();

                            openLightbox(
                              idx
                            );
                          }}
                        >
                          <img
                            src={url}
                            alt={`Post image ${
                              idx + 1
                            }`}
                            className={`w-full h-full object-cover ${
                              post.imageUrls!.length ===
                                3 &&
                              idx === 0
                                ? ""
                                : "aspect-square"
                            }`}
                          />

                          {galleryImages.length >
                            4 &&
                            idx === 3 && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                <span className="text-white text-lg font-bold">
                                  +
                                  {galleryImages.length -
                                    4}
                                </span>
                              </div>
                            )}

                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/20">
                            <ZoomIn className="w-6 h-6 text-white" />
                          </div>
                        </div>
                      )
                    )}
                </div>
              ) : (
                post.imageUrl && (
                  <div
                    className="mt-3 rounded-2xl overflow-hidden cursor-pointer group relative"
                    onClick={(e) => {
                      e.stopPropagation();

                      /*
                       * Videos go to Shorts.
                       *
                       * GIFs never reach this branch as videos.
                       */
                      if (
                        video &&
                        !videoLoadFailed
                      ) {
                        setShowVideoFeed(
                          true
                        );
                      } else {
                        openLightbox(0);
                      }
                    }}
                  >
                    {video &&
                    !videoLoadFailed ? (
                      <div
                        ref={
                          videoContainerRef
                        }
                        className="relative aspect-video w-full bg-black"
                      >
                        <video
                          ref={
                            videoRef
                          }
                          src={
                            post.imageUrl
                          }
                          className="w-full h-full object-contain pointer-events-none"
                          muted={
                            videoMuted
                          }
                          loop
                          playsInline
                          preload="metadata"
                          onContextMenu={(
                            e
                          ) =>
                            e.preventDefault()
                          }
                          onLoadedMetadata={(
                            e
                          ) =>
                            nudgeVideoFrame(
                              e.currentTarget
                            )
                          }
                          onLoadedData={(
                            e
                          ) =>
                            nudgeVideoFrame(
                              e.currentTarget
                            )
                          }
                          onCanPlay={(
                            e
                          ) => {
                            if (
                              videoInView
                            ) {
                              e.currentTarget
                                .play()
                                .catch(
                                  () => {}
                                );
                            }
                          }}
                          onError={() => {
                            setVideoLoadFailed(
                              true
                            );
                          }}
                        />

                        {!videoInView && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/20 transition">
                            <div className="bg-black/50 rounded-full p-3">
                              <Play className="w-8 h-8 text-white fill-white" />
                            </div>
                          </div>
                        )}

                        <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded-full pointer-events-none">
                          Video
                        </div>

                        {videoInView && (
                          <button
                            type="button"
                            onClick={(
                              e
                            ) => {
                              e.stopPropagation();

                              setVideoMuted(
                                (m) =>
                                  !m
                              );
                            }}
                            className="absolute bottom-2 right-2 z-10 bg-black/50 hover:bg-black/70 rounded-full p-2 transition"
                            title={
                              videoMuted
                                ? "Unmute"
                                : "Mute"
                            }
                            aria-label={
                              videoMuted
                                ? "Unmute video"
                                : "Mute video"
                            }
                          >
                            {videoMuted ? (
                              <VolumeX className="w-4 h-4 text-white" />
                            ) : (
                              <Volume2 className="w-4 h-4 text-white" />
                            )}
                          </button>
                        )}

                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          {!videoInView && (
                            <div className="bg-black/50 rounded-full p-3">
                              <Play className="w-8 h-8 text-white fill-white" />
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <>
                        <img
                          src={
                            post.imageUrl
                          }
                          alt="Post image"
                          className="w-full"
                        />

                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/20">
                          <ZoomIn className="w-8 h-8 text-white" />
                        </div>
                      </>
                    )}
                  </div>
                )
              )}
            </div>

            {/* ACTION BAR */}
            <div className="flex items-center justify-between mt-3">

              {/* COMMENTS */}
              <button
                onClick={() =>
                  setShowComments(
                    !showComments
                  )
                }
                className={`group flex items-center gap-1 text-sm ${
                  commentsEnabled
                    ? "text-gray-500 dark:text-gray-400"
                    : "text-gray-300 dark:text-gray-500 cursor-not-allowed opacity-50"
                } transition`}
                disabled={
                  !commentsEnabled
                }
              >
                <span
                  className={`p-2 rounded-full transition ${
                    commentsEnabled
                      ? "group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 group-hover:text-blue-500"
                      : ""
                  }`}
                >
                  <MessageCircle className="w-[18px] h-[18px]" />
                </span>

                <span className="group-hover:text-blue-500 transition whitespace-nowrap">
                  {formatCount(
                    commentsCount
                  )}
                </span>
              </button>

              {/* REPOST */}
              <div className="relative">
                <button
                  onClick={() =>
                    setRepostDropdownOpen(
                      !repostDropdownOpen
                    )
                  }
                  className={`group flex items-center text-sm ${
                    reposted
                      ? "text-green-500"
                      : "text-gray-500 dark:text-gray-400"
                  } transition`}
                >
                  <span className="p-2 rounded-full transition group-hover:bg-green-50 dark:group-hover:bg-green-900/20 group-hover:text-green-500">
                    <Repeat
                      className={`w-[18px] h-[18px] ${
                        reposted
                          ? "fill-green-500"
                          : ""
                      }`}
                    />
                  </span>

                  <span className="group-hover:text-green-500 transition -ml-1 whitespace-nowrap">
                    {formatCount(
                      repostsCount +
                        (post._count
                          ?.quotedBy ||
                          0)
                    )}
                  </span>

                  <ChevronDown className="w-3 h-3 ml-0.5" />
                </button>

                {repostDropdownOpen && (
                  <div className="absolute left-0 mt-1 w-36 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-20 overflow-hidden">

                    {reposted ? (
                      <button
                        onClick={() => {
                          handleRepost();

                          setRepostDropdownOpen(
                            false
                          );
                        }}
                        className="block w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                      >
                        Undo Repost
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          handleRepost();

                          setRepostDropdownOpen(
                            false
                          );
                        }}
                        className="block w-full text-left px-4 py-2.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                      >
                        Repost
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setShowQuoteModal(
                          true
                        );

                        setRepostDropdownOpen(
                          false
                        );
                      }}
                      className="block w-full text-left px-4 py-2.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                    >
                      Quote
                    </button>

                    <Link
                      href={`/post/${post.id}/reposts`}
                      className="block w-full text-left px-4 py-2 text-xs text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition border-t border-gray-100 dark:border-gray-700"
                    >
                      {formatCount(
                        repostsCount
                      )}{" "}
                      reposts
                    </Link>

                    <Link
                      href={`/post/${post.id}/quotes`}
                      className="block w-full text-left px-4 py-2 text-xs text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                    >
                      {formatCount(
                        post._count
                          ?.quotedBy ||
                          0
                      )}{" "}
                      quotes
                    </Link>
                  </div>
                )}
              </div>

              {/* LIKE */}
              <button
                onClick={
                  handleLike
                }
                className={`group flex items-center gap-1 text-sm ${
                  liked
                    ? "text-red-500"
                    : "text-gray-500 dark:text-gray-400"
                } transition`}
              >
                <span className="p-2 rounded-full transition group-hover:bg-red-50 dark:group-hover:bg-red-900/20 group-hover:text-red-500">
                  <Heart
                    className={`w-[18px] h-[18px] ${
                      liked
                        ? "fill-red-500"
                        : ""
                    }`}
                  />
                </span>

                <span className="group-hover:text-red-500 transition -ml-1 whitespace-nowrap">
                  {formatCount(
                    likesCount
                  )}
                </span>
              </button>

              {/* VIEWS */}
              <span
                className="flex items-center gap-1 text-sm text-gray-400 dark:text-gray-500 whitespace-nowrap"
                title={`${viewsCount.toLocaleString()} views`}
              >
                <span className="p-2">
                  <BarChart3 className="w-[18px] h-[18px]" />
                </span>

                <span className="-ml-1 whitespace-nowrap">
                  {formatCount(
                    viewsCount
                  )}
                </span>
              </span>

              {/* BOOKMARK + SHARE */}
              <div className="flex items-center">

                <button
                  onClick={
                    handleBookmark
                  }
                  disabled={
                    bookmarkLoading
                  }
                  className={`group p-2 rounded-full transition hover:bg-blue-50 dark:hover:bg-blue-900/20 ${
                    bookmarked
                      ? "text-blue-500"
                      : "text-gray-400 dark:text-gray-500 hover:text-blue-500"
                  }`}
                  title={
                    bookmarked
                      ? "Remove bookmark"
                      : "Bookmark"
                  }
                >
                  <Bookmark
                    className={`w-[18px] h-[18px] ${
                      bookmarked
                        ? "fill-current"
                        : ""
                    }`}
                  />
                </button>

                <button
                  onClick={
                    handleShare
                  }
                  className="p-2 rounded-full transition text-gray-400 dark:text-gray-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-500"
                >
                  <Share2 className="w-[18px] h-[18px]" />
                </button>
              </div>

              {!commentsEnabled && (
                <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                  Comments off
                </span>
              )}
            </div>

            {/* REACTIONS */}
            {!reactionsLoading && (
              <div className="flex items-center gap-2 mt-2 flex-wrap">

                {Object.entries(
                  reactions
                )
                  .sort(
                    (a, b) =>
                      b[1] - a[1]
                  )
                  .map(
                    ([
                      emoji,
                      count,
                    ]) => (
                      <button
                        key={
                          emoji
                        }
                        onClick={() =>
                          handleReaction(
                            emoji
                          )
                        }
                        className={`text-sm px-2 py-1 rounded-full border transition ${
                          userReaction ===
                          emoji
                            ? "bg-zrp-red/10 border-zrp-red text-zrp-red"
                            : "bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700"
                        }`}
                      >
                        {emoji}

                        <span className="ml-1 text-xs">
                          {
                            count
                          }
                        </span>
                      </button>
                    )
                  )}

                <button
                  onClick={() =>
                    setShowEmojiPicker(
                      true
                    )
                  }
                  className="text-sm px-2 py-1 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* INLINE COMMENTS */}
            {commentsEnabled &&
              showInlineComments &&
              showComments && (
                <Comments
                  postId={
                    post.id
                  }
                  onCommentAdded={
                    handleCommentCountChange
                  }
                />
              )}
          </div>
        </div>
      </div>

      {/* EDIT MODAL */}
      <EditPostModal
        post={post}
        isOpen={
          showEditModal
        }
        onClose={() =>
          setShowEditModal(
            false
          )
        }
        onUpdate={onUpdate}
      />

      {/* DELETE CONFIRMATION */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white dark:bg-zrp-deepBlack rounded-2xl shadow-xl max-w-sm w-full p-6">

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              Delete Post?
            </h2>

            <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">
              This action cannot be undone.
            </p>

            <div className="flex gap-3 justify-end">

              <button
                onClick={() =>
                  setShowDeleteConfirm(
                    false
                  )
                }
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-full text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                Cancel
              </button>

              <button
                onClick={
                  handleDelete
                }
                disabled={
                  deleting
                }
                className="bg-red-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {deleting
                  ? "Deleting..."
                  : "Delete"}
              </button>

            </div>
          </div>
        </div>
      )}

      {/* REPORT */}
      <ReportModal
        isOpen={
          showReportModal
        }
        onClose={() =>
          setShowReportModal(
            false
          )
        }
        onSubmit={
          handleReport
        }
      />

      {/* IMAGE LIGHTBOX */}
      {lightboxOpen &&
        lightboxImageIndex !== null && (
          <div
            className="fixed inset-0 z-[999] bg-black/95 flex items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-label="Image gallery"
            onClick={closeLightbox}
            onTouchStart={
              handleLightboxTouchStart
            }
            onTouchEnd={
              handleLightboxTouchEnd
            }
          >
            <div
              className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 sm:px-6 py-4 bg-gradient-to-b from-black/70 to-transparent"
              onClick={(e) =>
                e.stopPropagation()
              }
            >
              <div className="text-white text-sm font-semibold bg-black/40 backdrop-blur-sm rounded-full px-3 py-1.5">
                {lightboxImageIndex + 1} /{" "}
                {galleryImages.length}
              </div>

              <button
                type="button"
                onClick={closeLightbox}
                aria-label="Close image"
                className="flex items-center justify-center w-10 h-10 rounded-full bg-black/50 hover:bg-white/20 text-white transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {galleryImages.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  showPreviousLightboxImage();
                }}
                aria-label="Previous image"
                className="hidden sm:flex absolute left-4 lg:left-8 top-1/2 -translate-y-1/2 z-20 items-center justify-center w-11 h-11 lg:w-12 lg:h-12 rounded-full bg-black/50 hover:bg-white/20 text-white transition"
              >
                <ChevronLeft className="w-7 h-7" />
              </button>
            )}

            <div
              className="relative w-full h-full flex items-center justify-center px-3 sm:px-16 lg:px-24 py-16 sm:py-20"
              onClick={(e) =>
                e.stopPropagation()
              }
            >
              <img
                key={
                  galleryImages[
                    lightboxImageIndex
                  ]
                }
                src={
                  galleryImages[
                    lightboxImageIndex
                  ]
                }
                alt={`Post image ${
                  lightboxImageIndex + 1
                } of ${
                  galleryImages.length
                }`}
                draggable={false}
                className="max-w-full max-h-full w-auto h-auto object-contain select-none rounded-sm"
              />
            </div>

            {galleryImages.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  showNextLightboxImage();
                }}
                aria-label="Next image"
                className="hidden sm:flex absolute right-4 lg:right-8 top-1/2 -translate-y-1/2 z-20 items-center justify-center w-11 h-11 lg:w-12 lg:h-12 rounded-full bg-black/50 hover:bg-white/20 text-white transition"
              >
                <ChevronRight className="w-7 h-7" />
              </button>
            )}

            {galleryImages.length > 1 && (
              <div
                className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 sm:hidden"
                onClick={(e) =>
                  e.stopPropagation()
                }
              >
                <div className="bg-black/50 backdrop-blur-sm text-white text-xs font-medium rounded-full px-4 py-2">
                  Swipe to browse
                </div>
              </div>
            )}
          </div>
        )}

      {/* EMOJI PICKER */}
      {showEmojiPicker && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black/40"
          onClick={() =>
            setShowEmojiPicker(false)
          }
        >
          <div
            className="w-full sm:w-auto max-h-[70vh] sm:max-h-[80vh] overflow-hidden rounded-t-2xl sm:rounded-xl bg-white dark:bg-zrp-deepBlack shadow-2xl"
            onClick={(e) =>
              e.stopPropagation()
            }
          >
            <div className="flex justify-end p-2 border-b border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() =>
                  setShowEmojiPicker(false)
                }
                className="p-1 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <EmojiPicker
              onEmojiClick={(
                emoji
              ) =>
                handleReaction(
                  emoji.emoji
                )
              }
              width="100%"
              height={380}
            />
          </div>
        </div>
      )}

      {/* QUOTE POST */}
      {showQuoteModal && (
        <QuotePostModal
          post={post}
          onClose={() =>
            setShowQuoteModal(false)
          }
          onQuotePosted={
            onUpdate
          }
        />
      )}

      {/* VIDEO VIEWER / SHORTS */}
      {showVideoFeed && (
        <VideoFeedViewer
          startPostId={
            post.id
          }
          onClose={() =>
            setShowVideoFeed(false)
          }
        />
      )}
    </>
  );
}
