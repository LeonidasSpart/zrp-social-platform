"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Heart,
  MessageCircle,
  Repeat,
  Repeat2,
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
  Briefcase,
  FileText,
  Globe,
  Loader2,
  Play,
  Volume2,
  VolumeX,
  MoreHorizontal,
  UserPlus,
  ExternalLink,
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
  };

  onUpdate: (deletedPostId?: string) => void;

  showPinOption?: boolean;
  isPinned?: boolean;
  onPinToggle?: () => void;
  showInlineComments?: boolean;
}

/* ─────────────────────────────────────────────────────────────
   PARSE CONTENT
───────────────────────────────────────────────────────────── */

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
        ? raw.slice(
            0,
            raw.length - trailingMatch[0].length
          )
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

/* ─────────────────────────────────────────────────────────────
   EXTRACT URL
───────────────────────────────────────────────────────────── */

function extractFirstUrl(content: string): string | null {
  const match = content.match(
    /(https?:\/\/[^\s]+)|(www\.[^\s]+)/
  );

  if (!match) return null;

  const raw = match[0].replace(
    /[.,!?;:'")\]}]+$/,
    ""
  );

  return raw.startsWith("http")
    ? raw
    : `https://${raw}`;
}

/* ─────────────────────────────────────────────────────────────
   FORMAT COUNTS
───────────────────────────────────────────────────────────── */

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

/* ─────────────────────────────────────────────────────────────
   COMPONENT
───────────────────────────────────────────────────────────── */

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

  /* ─────────────────────────────────────────────────────────
     BASIC STATE
  ───────────────────────────────────────────────────────── */

  const [liked, setLiked] = useState(
    post.liked || false
  );

  const [likesCount, setLikesCount] = useState(
    post._count?.likes || 0
  );

  const [commentsCount, setCommentsCount] = useState(
    post._count?.comments || 0
  );

  const [reposted, setReposted] = useState(false);

  const [repostsCount, setRepostsCount] = useState(
    post._count?.reposts || 0
  );

  const [viewsCount, setViewsCount] = useState(
    post.views || 0
  );

  const [bookmarked, setBookmarked] = useState(false);

  const [bookmarkLoading, setBookmarkLoading] =
    useState(false);

  /* ─────────────────────────────────────────────────────────
     MENUS / MODALS
  ───────────────────────────────────────────────────────── */

  const [moreMenuOpen, setMoreMenuOpen] =
    useState(false);

  const [repostDropdownOpen, setRepostDropdownOpen] =
    useState(false);

  const [showComments, setShowComments] =
    useState(false);

  const [showEditModal, setShowEditModal] =
    useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] =
    useState(false);

  const [showReportModal, setShowReportModal] =
    useState(false);

  const [showQuoteModal, setShowQuoteModal] =
    useState(false);

  const [showEmojiPicker, setShowEmojiPicker] =
    useState(false);

  const [deleting, setDeleting] =
    useState(false);

  /* ─────────────────────────────────────────────────────────
     PIN
  ───────────────────────────────────────────────────────── */

  const [pinLoading, setPinLoading] =
    useState(false);

  /* ─────────────────────────────────────────────────────────
     MEDIA
  ───────────────────────────────────────────────────────── */

  const [lightboxImage, setLightboxImage] =
    useState<string | null>(null);

  const [showVideoFeed, setShowVideoFeed] =
    useState(false);

  const [videoLoadFailed, setVideoLoadFailed] =
    useState(false);

  const videoRef =
    useRef<HTMLVideoElement>(null);

  const videoContainerRef =
    useRef<HTMLDivElement>(null);

  const posterNudged =
    useRef(false);

  const [videoInView, setVideoInView] =
    useState(false);

  const [videoMuted, setVideoMuted] =
    useState(true);

  /* ─────────────────────────────────────────────────────────
     REACTIONS
  ───────────────────────────────────────────────────────── */

  const [reactions, setReactions] =
    useState<Record<string, number>>({});

  const [userReaction, setUserReaction] =
    useState<string | null>(null);

  const [reactionsLoading, setReactionsLoading] =
    useState(true);

  /* ─────────────────────────────────────────────────────────
     CONTENT
  ───────────────────────────────────────────────────────── */

  const [articleExpanded, setArticleExpanded] =
    useState(false);

  const [contentExpanded, setContentExpanded] =
    useState(false);

  /* ─────────────────────────────────────────────────────────
     LINK PREVIEW
  ───────────────────────────────────────────────────────── */

  const [linkPreviewFoundFor, setLinkPreviewFoundFor] =
    useState<string | null>(null);

  /* ─────────────────────────────────────────────────────────
     TRANSLATION
  ───────────────────────────────────────────────────────── */

  const [translatedText, setTranslatedText] =
    useState<string | null>(null);

  const [showTranslation, setShowTranslation] =
    useState(false);

  const [translating, setTranslating] =
    useState(false);

  const [translateError, setTranslateError] =
    useState(false);

  /* ─────────────────────────────────────────────────────────
     DOUBLE CLICK
  ───────────────────────────────────────────────────────── */

  const [lastClickTime, setLastClickTime] =
    useState(0);

  /* ─────────────────────────────────────────────────────────
     REFS
  ───────────────────────────────────────────────────────── */

  const moreMenuRef =
    useRef<HTMLDivElement>(null);

  const repostMenuRef =
    useRef<HTMLDivElement>(null);

  const hasCountedView =
    useRef(false);

  /* ─────────────────────────────────────────────────────────
     DERIVED VALUES
  ───────────────────────────────────────────────────────── */

  const isAuthor =
    session?.user?.id === post.author.id;

  const commentsEnabled =
    post.commentsEnabled !== false;

  const postType =
    post.type || "POST";

  const contentParts =
    parseContent(post.content);

  const CONTENT_TRUNCATE_LENGTH = 280;

  const isLongContent =
    post.content.length >
    CONTENT_TRUNCATE_LENGTH;

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

  const isRepost =
    post.isRepost === true;

  const originalAuthor =
    post.repostOriginalAuthor;

  /* ─────────────────────────────────────────────────────────
     VIDEO DETECTION
  ───────────────────────────────────────────────────────── */

  const isVideo = () => {
    if (post.mediaType === "video")
      return true;

    if (post.mediaType === "image")
      return false;

    if (!post.imageUrl)
      return false;

    if (
      post.imageUrls &&
      post.imageUrls.length > 1
    ) {
      return false;
    }

    const url =
      post.imageUrl.toLowerCase();

    const path =
      url.split("?")[0];

    const videoExtensions = [
      "mp4",
      "webm",
      "mov",
      "avi",
      "mkv",
      "m4v",
      "3gp",
    ];

    if (
      videoExtensions.some((ext) =>
        path.endsWith("." + ext)
      )
    ) {
      return true;
    }

    const imageExtensions = [
      "jpg",
      "jpeg",
      "png",
      "gif",
      "webp",
      "svg",
      "avif",
      "bmp",
    ];

    if (
      imageExtensions.some((ext) =>
        path.endsWith("." + ext)
      )
    ) {
      return false;
    }

    if (
      url.includes("/video/") ||
      url.includes("video")
    ) {
      return true;
    }

    return true;
  };

  const video = isVideo();

  /* ─────────────────────────────────────────────────────────
     OUTSIDE CLICK
  ───────────────────────────────────────────────────────── */

  useEffect(() => {
    const handleClickOutside = (
      event: MouseEvent
    ) => {
      const target =
        event.target as Node;

      if (
        moreMenuRef.current &&
        !moreMenuRef.current.contains(target)
      ) {
        setMoreMenuOpen(false);
      }

      if (
        repostMenuRef.current &&
        !repostMenuRef.current.contains(target)
      ) {
        setRepostDropdownOpen(false);
      }
    };

    document.addEventListener(
      "mousedown",
      handleClickOutside
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleClickOutside
      );
    };
  }, []);

  /* ─────────────────────────────────────────────────────────
     VIDEO VIEW
  ───────────────────────────────────────────────────────── */

  useEffect(() => {
    if (
      !video ||
      !videoContainerRef.current
    ) {
      return;
    }

    const element =
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

    observer.observe(element);

    return () =>
      observer.disconnect();
  }, [video]);

  useEffect(() => {
    const element =
      videoRef.current;

    if (!element)
      return;

    if (videoInView) {
      element.muted =
        videoMuted;

      const playPromise =
        element.play();

      if (playPromise) {
        playPromise.catch(() => {});
      }
    } else {
      element.pause();
    }
  }, [
    videoInView,
    videoMuted,
  ]);

  const nudgeVideoFrame = (
    element: HTMLVideoElement
  ) => {
    if (posterNudged.current)
      return;

    posterNudged.current =
      true;

    try {
      element.currentTime =
        Math.min(
          0.1,
          (element.duration || 1) *
            0.05
        );
    } catch {
      // Ignore unsupported browser behavior.
    }
  };

  /* ─────────────────────────────────────────────────────────
     REPOST STATUS
  ───────────────────────────────────────────────────────── */

  useEffect(() => {
    const checkRepost =
      async () => {
        if (!session)
          return;

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

  /* ─────────────────────────────────────────────────────────
     REACTIONS
  ───────────────────────────────────────────────────────── */

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
                acc: Record<
                  string,
                  number
                >,
                reaction: any
              ) => {
                acc[reaction.emoji] =
                  (acc[reaction.emoji] ||
                    0) + 1;

                return acc;
              },
              {}
            );

          setReactions(
            counts
          );

          const ownReaction =
            data.find(
              (reaction: any) =>
                reaction.user.id ===
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
        setReactionsLoading(
          false
        );
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
      if (!session)
        return;

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
          setShowEmojiPicker(
            false
          );
        }
      } catch (error) {
        console.error(
          "Error toggling reaction:",
          error
        );
      }
    };

  /* ─────────────────────────────────────────────────────────
     BOOKMARK
  ───────────────────────────────────────────────────────── */

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

  /* ─────────────────────────────────────────────────────────
     VIEW COUNT
  ───────────────────────────────────────────────────────── */

  useEffect(() => {
    if (hasCountedView.current)
      return;

    hasCountedView.current =
      true;

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

    if (
      viewed.includes(post.id)
    ) {
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
        if (
          data?.views != null
        ) {
          setViewsCount(
            data.views
          );
        } else {
          setViewsCount(
            (value) => value + 1
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

  /* ─────────────────────────────────────────────────────────
     COMMENTS
  ───────────────────────────────────────────────────────── */

  const handleCommentCountChange =
    (delta?: number) => {
      setCommentsCount(
        (previous) =>
          Math.max(
            0,
            previous +
              (delta || 0)
          )
      );
    };

  /* ─────────────────────────────────────────────────────────
     LIKE
  ───────────────────────────────────────────────────────── */

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
          const nextLiked =
            !liked;

          setLiked(
            nextLiked
          );

          setLikesCount(
            nextLiked
              ? likesCount + 1
              : Math.max(
                  0,
                  likesCount - 1
                )
          );
        }
      } catch (error) {
        console.error(
          "Error liking post:",
          error
        );
      }
    };

  /* ─────────────────────────────────────────────────────────
     REPOST
  ───────────────────────────────────────────────────────── */

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
          "Error reposting:",
          error
        );
      }
    };

  /* ─────────────────────────────────────────────────────────
     SHARE
  ───────────────────────────────────────────────────────── */

  const handleShare =
    async () => {
      const url =
        window.location.href;

      if (
        navigator.share
      ) {
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

  /* ─────────────────────────────────────────────────────────
     DELETE
  ───────────────────────────────────────────────────────── */

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

          setShowDeleteConfirm(
            false
          );
        } else {
          alert(
            "Failed to delete post"
          );
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

  /* ─────────────────────────────────────────────────────────
     REPORT
  ───────────────────────────────────────────────────────── */

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

          setShowReportModal(
            false
          );
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

          if (
            res.status === 409
          ) {
            setShowReportModal(
              false
            );
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

  /* ─────────────────────────────────────────────────────────
     BOOKMARK
  ───────────────────────────────────────────────────────── */

  const handleBookmark =
    async () => {
      setBookmarkLoading(
        true
      );

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
        setBookmarkLoading(
          false
        );
      }
    };

  /* ─────────────────────────────────────────────────────────
     PIN
  ───────────────────────────────────────────────────────── */

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

  /* ─────────────────────────────────────────────────────────
     TRANSLATION
  ───────────────────────────────────────────────────────── */

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

          setShowTranslation(
            true
          );
        } else {
          setTranslateError(
            true
          );
        }
      } catch (error) {
        console.error(
          "Translate error:",
          error
        );

        setTranslateError(
          true
        );
      } finally {
        setTranslating(
          false
        );
      }
    };

  /* ─────────────────────────────────────────────────────────
     DOUBLE CLICK LIKE
  ───────────────────────────────────────────────────────── */

  const handlePostClick =
    (
      event: React.MouseEvent
    ) => {
      const now =
        Date.now();

      const timeSince =
        now - lastClickTime;

      setLastClickTime(
        now
      );

      if (
        timeSince < 300
      ) {
        handleLike();
      }
    };

  let lastTouchTime = 0;

  const handleTouchEnd =
    () => {
      const now =
        Date.now();

      const timeSince =
        now - lastTouchTime;

      lastTouchTime =
        now;

      if (
        timeSince < 300
      ) {
        handleLike();
      }
    };

  /* ─────────────────────────────────────────────────────────
     TIME AGO
  ───────────────────────────────────────────────────────── */

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

      if (days < 7)
        return `${days}d`;

      const weeks =
        Math.floor(
          days / 7
        );

      if (weeks < 5)
        return `${weeks}w`;

      return new Date(
        date
      ).toLocaleDateString(
        undefined,
        {
          month: "short",
          day: "numeric",
        }
      );
    };

  /* ─────────────────────────────────────────────────────────
     INITIAL
  ───────────────────────────────────────────────────────── */

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

  /* ─────────────────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────────────────── */

  return (
    <>
      <article
        className="
          group
          bg-white
          dark:bg-zrp-deepBlack
          px-3
          sm:px-4
          py-4
          border-b
          border-gray-200
          dark:border-gray-800
          hover:bg-gray-50/50
          dark:hover:bg-white/[0.025]
          transition-colors
        "
      >
        <div className="flex items-start gap-3">

          {/* ─────────────────────────────────────────────
              AVATAR
          ───────────────────────────────────────────── */}

          <Link
            href={`/profile/${post.author.username}`}
            onClick={(e) =>
              e.stopPropagation()
            }
            className="flex-shrink-0"
          >
            <div
              className="
                relative
                w-11
                h-11
                sm:w-12
                sm:h-12
                rounded-full
                overflow-hidden
                bg-gradient-to-br
                from-zrp-red/30
                to-gray-800
                ring-1
                ring-gray-200
                dark:ring-gray-700
                transition
                group-hover:ring-zrp-red/30
              "
            >
              {post.author.avatarUrl ? (
                <img
                  src={
                    post.author.avatarUrl
                  }
                  alt={
                    post.author.name ||
                    post.author.username
                  }
                  className="
                    w-full
                    h-full
                    object-cover
                  "
                />
              ) : (
                <div
                  className="
                    w-full
                    h-full
                    flex
                    items-center
                    justify-center
                    text-zrp-red
                    font-bold
                    text-lg
                  "
                >
                  {getInitial()}
                </div>
              )}
            </div>
          </Link>

          <div className="flex-1 min-w-0">

            {/* ─────────────────────────────────────────
                HEADER
            ───────────────────────────────────────── */}

            <div className="flex items-start justify-between gap-2">

              <div className="min-w-0">

                <div className="flex items-center gap-1.5 flex-wrap">

                  <Link
                    href={`/profile/${post.author.username}`}
                    onClick={(e) =>
                      e.stopPropagation()
                    }
                    className="
                      font-bold
                      text-[15px]
                      text-gray-950
                      dark:text-white
                      hover:underline
                      truncate
                      max-w-[180px]
                      sm:max-w-none
                    "
                  >
                    {post.author.name ||
                      post.author.username}
                  </Link>

                  <VerifiedBadge
                    badgeType={
                      post.author
                        .badgeType
                    }
                  />

                  {!isAuthor && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                      className="
                        hidden
                        sm:inline-flex
                        items-center
                        gap-1
                        ml-1
                        px-2.5
                        py-1
                        rounded-full
                        border
                        border-gray-300
                        dark:border-gray-700
                        text-xs
                        font-semibold
                        text-gray-700
                        dark:text-gray-200
                        hover:border-zrp-red
                        hover:text-zrp-red
                        transition
                      "
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Follow
                    </button>
                  )}
                </div>

                <div
                  className="
                    flex
                    items-center
                    gap-1
                    text-[13px]
                    text-gray-500
                    dark:text-gray-400
                  "
                >
                  <Link
                    href={`/profile/${post.author.username}`}
                    onClick={(e) =>
                      e.stopPropagation()
                    }
                    className="hover:underline"
                  >
                    @{post.author.username}
                  </Link>

                  <span>·</span>

                  <span>
                    {timeAgo(
                      post.createdAt
                    )}
                  </span>

                  {post.updatedAt &&
                    post.updatedAt !==
                      post.createdAt && (
                      <>
                        <span>·</span>
                        <span>
                          edited
                        </span>
                      </>
                    )}
                </div>

                {/* Post type */}
                {postType !==
                  "POST" && (
                  <div className="mt-1.5">

                    {postType ===
                      "RECRUITMENT" && (
                      <span
                        className="
                          inline-flex
                          items-center
                          gap-1.5
                          px-2.5
                          py-1
                          rounded-full
                          bg-blue-500/10
                          text-blue-500
                          text-xs
                          font-semibold
                        "
                      >
                        <Briefcase className="w-3.5 h-3.5" />
                        Recruitment
                      </span>
                    )}

                    {postType ===
                      "ARTICLE" && (
                      <span
                        className="
                          inline-flex
                          items-center
                          gap-1.5
                          px-2.5
                          py-1
                          rounded-full
                          bg-purple-500/10
                          text-purple-500
                          text-xs
                          font-semibold
                        "
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Article
                      </span>
                    )}

                  </div>
                )}
              </div>

              {/* ───────────────────────────────────────
                  MORE MENU
              ─────────────────────────────────────── */}

              <div
                ref={moreMenuRef}
                className="relative flex-shrink-0"
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();

                    setMoreMenuOpen(
                      (value) =>
                        !value
                    );

                    setRepostDropdownOpen(
                      false
                    );
                  }}
                  className="
                    p-2
                    rounded-full
                    text-gray-400
                    hover:text-gray-800
                    dark:hover:text-white
                    hover:bg-gray-100
                    dark:hover:bg-white/10
                    transition
                  "
                  aria-label="More options"
                  aria-expanded={
                    moreMenuOpen
                  }
                >
                  <MoreHorizontal className="w-5 h-5" />
                </button>

                {moreMenuOpen && (
                  <div
                    className="
                      absolute
                      right-0
                      top-10
                      z-40
                      w-52
                      overflow-hidden
                      rounded-2xl
                      border
                      border-gray-200
                      dark:border-gray-700
                      bg-white
                      dark:bg-zrp-deepBlack
                      shadow-2xl
                    "
                    onClick={(e) =>
                      e.stopPropagation()
                    }
                  >

                    {isAuthor ? (
                      <>
                        {showPinOption && (
                          <button
                            onClick={() => {
                              setMoreMenuOpen(
                                false
                              );
                              handlePinToggle();
                            }}
                            disabled={
                              pinLoading
                            }
                            className="
                              w-full
                              flex
                              items-center
                              gap-3
                              px-4
                              py-3
                              text-left
                              text-sm
                              text-gray-700
                              dark:text-gray-200
                              hover:bg-gray-100
                              dark:hover:bg-white/5
                              transition
                            "
                          >
                            {isPinned ? (
                              <PinOff className="w-4 h-4" />
                            ) : (
                              <Pin className="w-4 h-4" />
                            )}

                            {isPinned
                              ? "Unpin from profile"
                              : "Pin to profile"}
                          </button>
                        )}

                        <button
                          onClick={() => {
                            setMoreMenuOpen(
                              false
                            );

                            setShowEditModal(
                              true
                            );
                          }}
                          className="
                            w-full
                            flex
                            items-center
                            gap-3
                            px-4
                            py-3
                            text-left
                            text-sm
                            text-gray-700
                            dark:text-gray-200
                            hover:bg-gray-100
                            dark:hover:bg-white/5
                            transition
                          "
                        >
                          <Pencil className="w-4 h-4" />
                          Edit post
                        </button>

                        <button
                          onClick={() => {
                            setMoreMenuOpen(
                              false
                            );

                            setShowDeleteConfirm(
                              true
                            );
                          }}
                          className="
                            w-full
                            flex
                            items-center
                            gap-3
                            px-4
                            py-3
                            text-left
                            text-sm
                            text-red-500
                            hover:bg-red-50
                            dark:hover:bg-red-500/10
                            transition
                          "
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete post
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setMoreMenuOpen(
                              false
                            );

                            setShowReportModal(
                              true
                            );
                          }}
                          className="
                            w-full
                            flex
                            items-center
                            gap-3
                            px-4
                            py-3
                            text-left
                            text-sm
                            text-gray-700
                            dark:text-gray-200
                            hover:bg-gray-100
                            dark:hover:bg-white/5
                            transition
                          "
                        >
                          <Flag className="w-4 h-4" />
                          Report post
                        </button>

                        <button
                          onClick={() =>
                            setMoreMenuOpen(
                              false
                            )
                          }
                          className="
                            w-full
                            flex
                            items-center
                            gap-3
                            px-4
                            py-3
                            text-left
                            text-sm
                            text-gray-700
                            dark:text-gray-200
                            hover:bg-gray-100
                            dark:hover:bg-white/5
                            transition
                          "
                        >
                          Not interested
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ─────────────────────────────────────────
                REPOST INDICATOR
            ───────────────────────────────────────── */}

            {isRepost &&
              originalAuthor && (
                <div
                  className="
                    flex
                    items-center
                    gap-1.5
                    mt-1
                    text-xs
                    text-gray-500
                    dark:text-gray-400
                  "
                >
                  <Repeat2 className="w-3.5 h-3.5 text-green-500" />

                  <span>
                    Reposted from{" "}
                    <Link
                      href={`/profile/${originalAuthor.username}`}
                      className="
                        text-zrp-red
                        hover:underline
                        font-medium
                      "
                      onClick={(e) =>
                        e.stopPropagation()
                      }
                    >
                      @{originalAuthor.username}
                    </Link>
                  </span>
                </div>
              )}

            {/* ─────────────────────────────────────────
                POST CONTENT
            ───────────────────────────────────────── */}

            <div
              onClick={
                handlePostClick
              }
              onTouchEnd={
                handleTouchEnd
              }
              className="
                cursor-pointer
                select-none
              "
            >
              <p
                className="
                  text-[15px]
                  sm:text-[16px]
                  leading-6
                  text-gray-800
                  dark:text-gray-200
                  mt-2
                  whitespace-pre-wrap
                  break-words
                "
              >
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
                          className="
                            text-zrp-red
                            hover:underline
                          "
                          onClick={(e) =>
                            e.stopPropagation()
                          }
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
                          className="
                            text-zrp-red
                            hover:underline
                          "
                          onClick={(e) =>
                            e.stopPropagation()
                          }
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
                          onClick={(e) =>
                            e.stopPropagation()
                          }
                          className="
                            text-zrp-red
                            hover:underline
                            break-all
                          "
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

              {/* Show more */}
              {isLongContent && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();

                    setContentExpanded(
                      !contentExpanded
                    );
                  }}
                  className="
                    text-sm
                    text-zrp-red
                    hover:underline
                    mt-0.5
                    font-medium
                  "
                >
                  {contentExpanded
                    ? "Show less"
                    : "Show more"}
                </button>
              )}

              {/* ─────────────────────────────────────
                  LINK PREVIEW
              ───────────────────────────────────── */}

              {!post.imageUrl &&
                previewUrl && (
                  <div
                    className="mt-3"
                    onClick={(e) =>
                      e.stopPropagation()
                    }
                  >
                    <LinkPreviewCard
                      url={previewUrl}
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
                  </div>
                )}

              {/* ─────────────────────────────────────
                  TRANSLATION
              ───────────────────────────────────── */}

              {post.content.trim()
                .length > 0 && (
                <div
                  className="mt-2"
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
                    className="
                      inline-flex
                      items-center
                      gap-1.5
                      text-xs
                      sm:text-sm
                      text-zrp-red
                      hover:underline
                      disabled:opacity-60
                    "
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
                    <p className="text-xs text-gray-400 mt-1">
                      Translation unavailable
                      right now.
                    </p>
                  )}

                  {showTranslation &&
                    translatedText && (
                      <div
                        className="
                          mt-2
                          pl-3
                          border-l-2
                          border-zrp-red/40
                        "
                      >
                        <p
                          className="
                            text-[15px]
                            leading-6
                            text-gray-700
                            dark:text-gray-300
                            whitespace-pre-wrap
                          "
                        >
                          {
                            translatedText
                          }
                        </p>
                      </div>
                    )}
                </div>
              )}

              {/* ─────────────────────────────────────
                  RECRUITMENT
              ───────────────────────────────────── */}

              {postType ===
                "RECRUITMENT" &&
                (post.company ||
                  post.location ||
                  post.applyUrl) && (
                  <div
                    className="
                      mt-3
                      rounded-2xl
                      border
                      border-gray-200
                      dark:border-gray-700
                      bg-gray-50
                      dark:bg-gray-800/50
                      overflow-hidden
                    "
                  >
                    <div className="p-4">

                      {post.company && (
                        <p
                          className="
                            font-bold
                            text-gray-900
                            dark:text-white
                          "
                        >
                          {
                            post.company
                          }
                        </p>
                      )}

                      {post.location && (
                        <div
                          className="
                            flex
                            items-center
                            gap-1.5
                            mt-1
                            text-sm
                            text-gray-500
                            dark:text-gray-400
                          "
                        >
                          <MapPin className="w-4 h-4" />
                          {
                            post.location
                          }
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
                          className="
                            inline-flex
                            items-center
                            gap-1.5
                            mt-3
                            px-4
                            py-2
                            rounded-full
                            bg-zrp-red
                            text-white
                            text-sm
                            font-semibold
                            hover:opacity-90
                            transition
                          "
                        >
                          Apply Now
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                )}

              {/* ─────────────────────────────────────
                  ARTICLE
              ───────────────────────────────────── */}

              {postType ===
                "ARTICLE" &&
                post.body && (
                  <div
                    className="
                      mt-3
                      rounded-2xl
                      border
                      border-gray-200
                      dark:border-gray-700
                      overflow-hidden
                    "
                  >
                    <div className="p-4">

                      <div
                        className="
                          prose
                          prose-sm
                          dark:prose-invert
                          max-w-none
                          prose-headings:text-gray-900
                          dark:prose-headings:text-white
                          prose-p:text-gray-800
                          dark:prose-p:text-gray-200
                          prose-a:text-zrp-red
                        "
                      >
                        {articleExpanded ? (
                          <div
                            dangerouslySetInnerHTML={{
                              __html:
                                post.body,
                            }}
                          />
                        ) : (
                          <div
                            dangerouslySetInnerHTML={{
                              __html:
                                post.body.slice(
                                  0,
                                  400
                                ) +
                                (post.body
                                  .length >
                                400
                                  ? "..."
                                  : ""),
                            }}
                          />
                        )}
                      </div>

                      {post.body.length >
                        400 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();

                            setArticleExpanded(
                              !articleExpanded
                            );
                          }}
                          className="
                            mt-2
                            text-sm
                            text-zrp-red
                            hover:underline
                            font-medium
                          "
                        >
                          {articleExpanded
                            ? "Show less"
                            : "Read more"}
                        </button>
                      )}
                    </div>
                  </div>
                )}

              {/* ─────────────────────────────────────
                  MULTI IMAGE
              ───────────────────────────────────── */}

              {!video &&
              post.imageUrls &&
              post.imageUrls.length >
                1 ? (
                <div
                  className={`
                    mt-3
                    rounded-2xl
                    overflow-hidden
                    border
                    border-gray-200
                    dark:border-gray-800
                    grid
                    gap-0.5
                    bg-black
                    ${
                      post.imageUrls
                        .length ===
                      2
                        ? "grid-cols-2"
                        : "grid-cols-2 grid-rows-2"
                    }
                  `}
                >
                  {post.imageUrls
                    .slice(0, 4)
                    .map(
                      (
                        url,
                        idx
                      ) => (
                        <div
                          key={
                            url
                          }
                          className={`
                            relative
                            cursor-pointer
                            group/media
                            bg-gray-100
                            dark:bg-gray-800
                            overflow-hidden
                            ${
                              post
                                .imageUrls!
                                .length ===
                                3 &&
                              idx ===
                                0
                                ? "row-span-2"
                                : ""
                            }
                          `}
                          onClick={(
                            e
                          ) => {
                            e.stopPropagation();

                            setLightboxImage(
                              url
                            );
                          }}
                        >
                          <img
                            src={
                              url
                            }
                            alt={`Post image ${
                              idx +
                              1
                            }`}
                            className={`
                              w-full
                              h-full
                              object-cover
                              transition-transform
                              duration-300
                              group-hover/media:scale-[1.02]
                              ${
                                post
                                  .imageUrls!
                                  .length ===
                                  3 &&
                                idx ===
                                  0
                                  ? ""
                                  : "aspect-square"
                              }
                            `}
                          />

                          <div
                            className="
                              absolute
                              inset-0
                              flex
                              items-center
                              justify-center
                              bg-black/0
                              group-hover/media:bg-black/20
                              transition
                            "
                          >
                            <ZoomIn
                              className="
                                w-7
                                h-7
                                text-white
                                opacity-0
                                group-hover/media:opacity-100
                                transition
                              "
                            />
                          </div>
                        </div>
                      )
                    )}
                </div>
              ) : (
                /* ─────────────────────────────────────
                   SINGLE IMAGE / VIDEO
                ───────────────────────────────────── */

                post.imageUrl && (
                  <div
                    className="
                      mt-3
                      rounded-2xl
                      overflow-hidden
                      border
                      border-gray-200
                      dark:border-gray-800
                      cursor-pointer
                      group/media
                      relative
                      bg-black
                    "
                    onClick={(e) => {
                      e.stopPropagation();

                      if (
                        video &&
                        !videoLoadFailed
                      ) {
                        setShowVideoFeed(
                          true
                        );
                      } else {
                        setLightboxImage(
                          post.imageUrl!
                        );
                      }
                    }}
                  >
                    {video &&
                    !videoLoadFailed ? (
                      <div
                        ref={
                          videoContainerRef
                        }
                        className="
                          relative
                          aspect-video
                          w-full
                          bg-black
                        "
                      >
                        <video
                          ref={
                            videoRef
                          }
                          src={
                            post.imageUrl
                          }
                          className="
                            w-full
                            h-full
                            object-contain
                          "
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
                          onError={() =>
                            setVideoLoadFailed(
                              true
                            )
                          }
                        />

                        {!videoInView && (
                          <div
                            className="
                              absolute
                              inset-0
                              flex
                              items-center
                              justify-center
                              bg-black/20
                            "
                          >
                            <div
                              className="
                                bg-black/60
                                backdrop-blur-sm
                                rounded-full
                                p-4
                              "
                            >
                              <Play
                                className="
                                  w-8
                                  h-8
                                  text-white
                                  fill-white
                                "
                              />
                            </div>
                          </div>
                        )}

                        {videoInView && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();

                              setVideoMuted(
                                (value) =>
                                  !value
                              );
                            }}
                            className="
                              absolute
                              bottom-3
                              right-3
                              bg-black/60
                              backdrop-blur-sm
                              hover:bg-black/80
                              rounded-full
                              p-2.5
                              transition
                            "
                            title={
                              videoMuted
                                ? "Unmute"
                                : "Mute"
                            }
                          >
                            {videoMuted ? (
                              <VolumeX className="w-4 h-4 text-white" />
                            ) : (
                              <Volume2 className="w-4 h-4 text-white" />
                            )}
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        <img
                          src={
                            post.imageUrl
                          }
                          alt="Post media"
                          className="
                            w-full
                            max-h-[700px]
                            object-cover
                            transition-transform
                            duration-300
                            group-hover/media:scale-[1.015]
                          "
                        />

                        <div
                          className="
                            absolute
                            top-3
                            right-3
                            opacity-0
                            group-hover/media:opacity-100
                            transition
                          "
                        >
                          <div
                            className="
                              p-2
                              rounded-full
                              bg-black/60
                              backdrop-blur-sm
                              text-white
                            "
                          >
                            <ZoomIn className="w-5 h-5" />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )
              )}
            </div>

            {/* ─────────────────────────────────────────
                ACTION BAR
            ───────────────────────────────────────── */}

            <div
              className="
                flex
                items-center
                justify-between
                mt-3
                max-w-[600px]
              "
            >

              {/* Comments */}
              <button
                onClick={() =>
                  setShowComments(
                    !showComments
                  )
                }
                disabled={
                  !commentsEnabled
                }
                className={`
                  group
                  flex
                  items-center
                  gap-1
                  transition
                  ${
                    commentsEnabled
                      ? "text-gray-500 dark:text-gray-400 hover:text-blue-500"
                      : "text-gray-300 dark:text-gray-600 cursor-not-allowed"
                  }
                `}
              >
                <span
                  className="
                    p-2
                    rounded-full
                    group-hover:bg-blue-500/10
                    transition
                  "
                >
                  <MessageCircle className="w-[19px] h-[19px]" />
                </span>

                <span className="text-xs sm:text-sm">
                  {formatCount(
                    commentsCount
                  )}
                </span>
              </button>

              {/* Repost */}
              <div
                ref={
                  repostMenuRef
                }
                className="relative"
              >
                <button
                  onClick={() => {
                    setRepostDropdownOpen(
                      (value) =>
                        !value
                    );

                    setMoreMenuOpen(
                      false
                    );
                  }}
                  className={`
                    group
                    flex
                    items-center
                    gap-1
                    transition
                    ${
                      reposted
                        ? "text-green-500"
                        : "text-gray-500 dark:text-gray-400 hover:text-green-500"
                    }
                  `}
                >
                  <span
                    className="
                      p-2
                      rounded-full
                      group-hover:bg-green-500/10
                      transition
                    "
                  >
                    <Repeat2
                      className="
                        w-[19px]
                        h-[19px]
                      "
                    />
                  </span>

                  <span className="text-xs sm:text-sm">
                    {formatCount(
                      repostsCount +
                        (post._count
                          ?.quotedBy ||
                          0)
                    )}
                  </span>
                </button>

                {repostDropdownOpen && (
                  <div
                    className="
                      absolute
                      left-0
                      bottom-10
                      z-40
                      w-40
                      overflow-hidden
                      rounded-xl
                      border
                      border-gray-200
                      dark:border-gray-700
                      bg-white
                      dark:bg-gray-800
                      shadow-xl
                    "
                  >
                    <button
                      onClick={() => {
                        handleRepost();

                        setRepostDropdownOpen(
                          false
                        );
                      }}
                      className="
                        w-full
                        px-4
                        py-2.5
                        text-left
                        text-sm
                        hover:bg-gray-100
                        dark:hover:bg-gray-700
                      "
                    >
                      {reposted
                        ? "Undo Repost"
                        : "Repost"}
                    </button>

                    <button
                      onClick={() => {
                        setShowQuoteModal(
                          true
                        );

                        setRepostDropdownOpen(
                          false
                        );
                      }}
                      className="
                        w-full
                        px-4
                        py-2.5
                        text-left
                        text-sm
                        hover:bg-gray-100
                        dark:hover:bg-gray-700
                      "
                    >
                      Quote
                    </button>

                    <Link
                      href={`/post/${post.id}/reposts`}
                      className="
                        block
                        px-4
                        py-2.5
                        text-xs
                        text-gray-400
                        hover:bg-gray-100
                        dark:hover:bg-gray-700
                        border-t
                        border-gray-100
                        dark:border-gray-700
                      "
                    >
                      {formatCount(
                        repostsCount
                      )}{" "}
                      reposts
                    </Link>

                    <Link
                      href={`/post/${post.id}/quotes`}
                      className="
                        block
                        px-4
                        py-2.5
                        text-xs
                        text-gray-400
                        hover:bg-gray-100
                        dark:hover:bg-gray-700
                      "
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

              {/* Like */}
              <button
                onClick={
                  handleLike
                }
                className={`
                  group
                  flex
                  items-center
                  gap-1
                  transition
                  ${
                    liked
                      ? "text-red-500"
                      : "text-gray-500 dark:text-gray-400 hover:text-red-500"
                  }
                `}
              >
                <span
                  className="
                    p-2
                    rounded-full
                    group-hover:bg-red-500/10
                    transition
                  "
                >
                  <Heart
                    className={`
                      w-[19px]
                      h-[19px]
                      transition-transform
                      ${
                        liked
                          ? "fill-current scale-110"
                          : ""
                      }
                    `}
                  />
                </span>

                <span className="text-xs sm:text-sm">
                  {formatCount(
                    likesCount
                  )}
                </span>
              </button>

              {/* Views */}
              <div
                className="
                  flex
                  items-center
                  gap-1
                  text-gray-400
                  dark:text-gray-500
                "
                title={`${viewsCount.toLocaleString()} views`}
              >
                <span className="p-2">
                  <BarChart3 className="w-[18px] h-[18px]" />
                </span>

                <span className="text-xs sm:text-sm">
                  {formatCount(
                    viewsCount
                  )}
                </span>
              </div>

              {/* Bookmark */}
              <button
                onClick={
                  handleBookmark
                }
                disabled={
                  bookmarkLoading
                }
                className={`
                  p-2
                  rounded-full
                  transition
                  ${
                    bookmarked
                      ? "text-blue-500 bg-blue-500/10"
                      : "text-gray-400 dark:text-gray-500 hover:text-blue-500 hover:bg-blue-500/10"
                  }
                `}
                aria-label="Bookmark"
              >
                <Bookmark
                  className="w-[19px] h-[19px]"
                  fill={
                    bookmarked
                      ? "currentColor"
                      : "none"
                  }
                />
              </button>

              {/* Share */}
              <button
                onClick={
                  handleShare
                }
                className="
                  p-2
                  rounded-full
                  text-gray-400
                  dark:text-gray-500
                  hover:text-blue-500
                  hover:bg-blue-500/10
                  transition
                "
                aria-label="Share"
              >
                <Share2 className="w-[19px] h-[19px]" />
              </button>
            </div>

            {/* ─────────────────────────────────────────
                REACTIONS
            ───────────────────────────────────────── */}

            {!reactionsLoading &&
              Object.keys(
                reactions
              ).length > 0 && (
                <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">

                  {Object.entries(
                    reactions
                  )
                    .sort(
                      (a, b) =>
                        b[1] - a[1]
                    )
                    .slice(0, 5)
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
                          className={`
                            inline-flex
                            items-center
                            gap-1
                            px-2.5
                            py-1
                            rounded-full
                            border
                            text-xs
                            transition
                            ${
                              userReaction ===
                              emoji
                                ? "bg-zrp-red/10 border-zrp-red/40 text-zrp-red"
                                : "bg-gray-50 dark:bg-gray-800/70 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-zrp-red/40"
                            }
                          `}
                        >
                          <span className="text-sm">
                            {
                              emoji
                            }
                          </span>

                          <span>
                            {formatCount(
                              count
                            )}
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
                    className="
                      w-7
                      h-7
                      rounded-full
                      border
                      border-gray-200
                      dark:border-gray-700
                      flex
                      items-center
                      justify-center
                      text-gray-400
                      hover:text-zrp-red
                      hover:border-zrp-red
                      transition
                    "
                    aria-label="Add reaction"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              )}

            {/* ─────────────────────────────────────────
                COMMENTS OFF
            ───────────────────────────────────────── */}

            {!commentsEnabled && (
              <div className="mt-2">
                <span
                  className="
                    inline-flex
                    items-center
                    gap-1
                    text-xs
                    text-gray-400
                    dark:text-gray-500
                    bg-gray-100
                    dark:bg-gray-800
                    px-2.5
                    py-1
                    rounded-full
                  "
                >
                  <MessageCircle className="w-3 h-3" />
                  Comments off
                </span>
              </div>
            )}

            {/* ─────────────────────────────────────────
                INLINE COMMENTS
            ───────────────────────────────────────── */}

            {commentsEnabled &&
              showInlineComments &&
              showComments && (
                <div className="mt-3">
                  <Comments
                    postId={post.id}
                    onCommentAdded={
                      handleCommentCountChange
                    }
                  />
                </div>
              )}
          </div>
        </div>
      </article>

      {/* ─────────────────────────────────────────────────────
          EDIT
      ───────────────────────────────────────────────────── */}

      <EditPostModal
        post={post}
        isOpen={showEditModal}
        onClose={() =>
          setShowEditModal(false)
        }
        onUpdate={onUpdate}
      />

      {/* ─────────────────────────────────────────────────────
          DELETE CONFIRMATION
      ───────────────────────────────────────────────────── */}

      {showDeleteConfirm && (
        <div
          className="
            fixed
            inset-0
            bg-black/60
            backdrop-blur-sm
            flex
            items-center
            justify-center
            z-[999]
            px-4
          "
        >
          <div
            className="
              bg-white
              dark:bg-zrp-deepBlack
              rounded-2xl
              shadow-2xl
              max-w-sm
              w-full
              p-6
              border
              border-gray-200
              dark:border-gray-800
            "
          >
            <h2
              className="
                text-xl
                font-bold
                text-gray-900
                dark:text-white
                mb-2
              "
            >
              Delete Post?
            </h2>

            <p
              className="
                text-gray-600
                dark:text-gray-400
                text-sm
                mb-6
              "
            >
              This action cannot be
              undone.
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() =>
                  setShowDeleteConfirm(
                    false
                  )
                }
                className="
                  px-4
                  py-2
                  border
                  border-gray-300
                  dark:border-gray-600
                  rounded-full
                  text-sm
                  font-medium
                  hover:bg-gray-50
                  dark:hover:bg-gray-800
                  transition
                "
              >
                Cancel
              </button>

              <button
                onClick={
                  handleDelete
                }
                disabled={deleting}
                className="
                  bg-red-600
                  text-white
                  px-4
                  py-2
                  rounded-full
                  text-sm
                  font-medium
                  hover:bg-red-700
                  disabled:opacity-50
                  disabled:cursor-not-allowed
                  transition
                "
              >
                {deleting
                  ? "Deleting..."
                  : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────
          REPORT MODAL
      ───────────────────────────────────────────────────── */}

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

      {/* ─────────────────────────────────────────────────────
          IMAGE LIGHTBOX
      ───────────────────────────────────────────────────── */}

      {lightboxImage && (
        <div
          className="
            fixed
            inset-0
            bg-black/95
            flex
            items-center
            justify-center
            z-[999]
            p-4
          "
          onClick={() =>
            setLightboxImage(
              null
            )
          }
        >
          <div
            className="
              relative
              max-w-5xl
              w-full
              flex
              items-center
              justify-center
            "
            onClick={(e) =>
              e.stopPropagation()
            }
          >
            <img
              src={
                lightboxImage
              }
              alt="Full size"
              className="
                max-w-full
                max-h-[90vh]
                object-contain
                rounded-xl
              "
            />

            <button
              onClick={() =>
                setLightboxImage(
                  null
                )
              }
              className="
                absolute
                top-3
                right-3
                text-white
                bg-black/60
                backdrop-blur-sm
                rounded-full
                p-2.5
                hover:bg-black/80
                transition
              "
              aria-label="Close image"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────
          EMOJI PICKER
      ───────────────────────────────────────────────────── */}

      {showEmojiPicker && (
        <div
          className="
            fixed
            inset-0
            z-[999]
            flex
            items-end
            sm:items-center
            sm:justify-center
            bg-black/50
            backdrop-blur-sm
          "
          onClick={() =>
            setShowEmojiPicker(
              false
            )
          }
        >
          <div
            className="
              w-full
              sm:w-auto
              max-h-[75vh]
              overflow-hidden
              rounded-t-2xl
              sm:rounded-2xl
              bg-white
              dark:bg-zrp-deepBlack
              shadow-2xl
            "
            onClick={(e) =>
              e.stopPropagation()
            }
          >
            <div
              className="
                flex
                items-center
                justify-between
                px-4
                py-3
                border-b
                border-gray-200
                dark:border-gray-700
              "
            >
              <span
                className="
                  font-semibold
                  text-gray-900
                  dark:text-white
                "
              >
                Add reaction
              </span>

              <button
                type="button"
                onClick={() =>
                  setShowEmojiPicker(
                    false
                  )
                }
                className="
                  p-1.5
                  rounded-full
                  text-gray-500
                  hover:bg-gray-100
                  dark:hover:bg-gray-700
                "
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

      {/* ─────────────────────────────────────────────────────
          QUOTE POST
      ───────────────────────────────────────────────────── */}

      {showQuoteModal && (
        <QuotePostModal
          post={post}
          onClose={() =>
            setShowQuoteModal(
              false
            )
          }
          onQuotePosted={
            onUpdate
          }
        />
      )}

      {/* ─────────────────────────────────────────────────────
          FULLSCREEN VIDEO FEED
      ───────────────────────────────────────────────────── */}

      {showVideoFeed && (
        <VideoFeedViewer
          startPostId={post.id}
          onClose={() =>
            setShowVideoFeed(
              false
            )
          }
        />
      )}
    </>
  );
}
