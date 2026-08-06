"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Heart, MessageCircle, Repeat, Share2, Pencil, Trash2, Flag,
  Bookmark, BarChart3, Pin, PinOff, X, ZoomIn, Plus, ChevronDown,
  Briefcase, FileText
} from "lucide-react";
import { useSession } from "next-auth/react";
import Comments from "./Comments";
import EditPostModal from "./EditPostModal";
import ReportModal from "./ReportModal";
import VerifiedBadge from "./VerifiedBadge";
import EmojiPicker from "emoji-picker-react";
import QuotePostModal from "./QuotePostModal";

interface PostCardProps {
  post: {
    id: string;
    content: string;
    imageUrl?: string;
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
    // ─── NEW FIELDS ──────────────────────────────────────────────
    type?: "POST" | "RECRUITMENT" | "ARTICLE";
    company?: string;
    location?: string;
    applyUrl?: string;
    body?: string;
  };
  onUpdate: () => void;
  showPinOption?: boolean;
  isPinned?: boolean;
  onPinToggle?: () => void;
  showInlineComments?: boolean;
}

// ─── PARSE HASHTAGS AND MENTIONS ──────────────────────────────────
function parseContent(content: string) {
  const parts: { type: "text" | "hashtag" | "mention"; value: string }[] = [];
  let lastIndex = 0;
  const regex = /(@\w+)|(#\w+)/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        value: content.slice(lastIndex, match.index),
      });
    }
    parts.push({
      type: match[0].startsWith("@") ? "mention" : "hashtag",
      value: match[0],
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push({ type: "text", value: content.slice(lastIndex) });
  }
  return parts;
}

// ─── FORMAT COUNTS LIKE X ────────────────────────────────────────────
function formatCount(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toString();
}

export default function PostCard({
  post,
  onUpdate,
  showPinOption = false,
  isPinned = false,
  onPinToggle,
  showInlineComments = true,
}: PostCardProps) {
  const { data: session } = useSession();
  const [liked, setLiked] = useState(post.liked || false);
  const [likesCount, setLikesCount] = useState(post._count?.likes || 0);
  const [showComments, setShowComments] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [repostsCount, setRepostsCount] = useState(post._count?.reposts || 0);
  const [viewsCount, setViewsCount] = useState(post.views || 0);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const hasCountedView = useRef(false);

  // ─── Repost dropdown ──────────────────────────────────────────────
  const [repostDropdownOpen, setRepostDropdownOpen] = useState(false);
  const [showQuoteModal, setShowQuoteModal] = useState(false);

  const [lastClickTime, setLastClickTime] = useState(0);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [reactions, setReactions] = useState<Record<string, number>>({});
  const [userReaction, setUserReaction] = useState<string | null>(null);
  const [reactionsLoading, setReactionsLoading] = useState(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // ─── Expand article body ──────────────────────────────────────────
  const [articleExpanded, setArticleExpanded] = useState(false);

  const isAuthor = session?.user?.id === post.author.id;
  const contentParts = parseContent(post.content);
  const isRepost = post.isRepost === true;
  const originalAuthor = post.repostOriginalAuthor;

  // ─── Comments enabled? ────────────────────────────────────────────
  const commentsEnabled = post.commentsEnabled !== false;

  // ─── Post type ────────────────────────────────────────────────────
  const postType = post.type || "POST";

  // ─── Video detection ──────────────────────────────────────────────
  const isVideo = () => {
    if (post.mediaType === 'video') return true;
    if (post.mediaType === 'image') return false;
    if (!post.imageUrl) return false;
    const url = post.imageUrl.toLowerCase();
    const path = url.split('?')[0];
    const videoExtensions = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', '3gp'];
    if (videoExtensions.some(ext => path.endsWith('.' + ext))) return true;
    if (url.includes('/video/') || url.includes('video')) return true;
    return false;
  };

  const video = isVideo();

  // ─── Video playing state ──────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  // ─── FETCH REPOST STATUS ──────────────────────────────────────────
  useEffect(() => {
    const checkRepost = async () => {
      if (!session) return;
      try {
        const res = await fetch(`/api/posts/${post.id}/repost`);
        if (res.ok) {
          const data = await res.json();
          setReposted(data.reposted);
        }
      } catch (error) {
        console.error("Error checking repost:", error);
      }
    };
    checkRepost();
  }, [post.id, session]);

  // ─── FETCH REACTIONS ──────────────────────────────────────────────
  const fetchReactions = async () => {
    try {
      const res = await fetch(`/api/posts/${post.id}/reaction`);
      if (res.ok) {
        const data = await res.json();
        const counts = data.reduce((acc: any, r: any) => {
          acc[r.emoji] = (acc[r.emoji] || 0) + 1;
          return acc;
        }, {});
        setReactions(counts);
        const ownReaction = data.find((r: any) => r.user.id === session?.user?.id)?.emoji || null;
        setUserReaction(ownReaction);
      }
    } catch (error) {
      console.error("Error fetching reactions:", error);
    } finally {
      setReactionsLoading(false);
    }
  };

  useEffect(() => {
    if (session) fetchReactions();
  }, [post.id, session]);

  const handleReaction = async (emoji: string) => {
    if (!session) return;
    try {
      const res = await fetch(`/api/posts/${post.id}/reaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      if (res.ok) {
        await fetchReactions();
        setShowEmojiPicker(false);
      }
    } catch (error) {
      console.error("Error toggling reaction:", error);
    }
  };

  // ─── BOOKMARK ──────────────────────────────────────────────────────
  useEffect(() => {
    const checkBookmark = async () => {
      try {
        const res = await fetch(`/api/posts/${post.id}/bookmark`);
        if (res.ok) {
          const data = await res.json();
          setBookmarked(data.bookmarked);
        }
      } catch (error) {
        console.error("Error checking bookmark:", error);
      }
    };
    if (session) {
      checkBookmark();
    }
  }, [post.id, session]);

  // ─── VIEW COUNT ──────────────────────────────────────────────────
  useEffect(() => {
    if (hasCountedView.current) return;
    hasCountedView.current = true;

    const storageKey = "zrp_viewed_posts";
    let viewed: string[] = [];
    try {
      viewed = JSON.parse(sessionStorage.getItem(storageKey) || "[]");
    } catch {
      viewed = [];
    }

    if (viewed.includes(post.id)) return;

    fetch(`/api/posts/${post.id}/view`, { method: "POST" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.views != null) {
          setViewsCount(data.views);
        } else {
          setViewsCount((v) => v + 1);
        }
      })
      .catch(() => {});

    viewed.push(post.id);
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(viewed.slice(-500)));
    } catch {}
  }, [post.id]);

  // ─── HANDLERS ──────────────────────────────────────────────────────

  const handleLike = async () => {
    try {
      const res = await fetch(`/api/posts/${post.id}/like`, { method: "POST" });
      if (res.ok) {
        setLiked(!liked);
        setLikesCount(liked ? likesCount - 1 : likesCount + 1);
      }
    } catch (error) {
      console.error("Error liking post:", error);
    }
  };

  const handleRepost = async () => {
    try {
      const res = await fetch(`/api/posts/${post.id}/repost`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setReposted(data.reposted);
        setRepostsCount(data.reposted ? repostsCount + 1 : repostsCount - 1);
        onUpdate();
      }
    } catch (error) {
      console.error("Error reposting:", error);
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Post by ${post.author.name || post.author.username}`,
          text: post.content,
          url,
        });
      } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(url);
        alert("Link copied to clipboard!");
      } catch {}
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/posts/${post.id}`, { method: "DELETE" });
      if (res.ok) {
        onUpdate();
        setShowDeleteConfirm(false);
      } else {
        alert("Failed to delete post");
      }
    } catch (error) {
      console.error("Error deleting post:", error);
      alert("Failed to delete post");
    } finally {
      setDeleting(false);
    }
  };

  const handleReport = async (reason: string, details?: string) => {
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id, reason, details }),
      });
      if (res.ok) {
        alert("Report submitted. Thank you for helping keep the community safe.");
        setShowReportModal(false);
      } else {
        alert("Failed to submit report. Please try again.");
      }
    } catch (error) {
      console.error("Report error:", error);
      alert("Failed to submit report. Please try again.");
    }
  };

  const handleBookmark = async () => {
    setBookmarkLoading(true);
    try {
      const res = await fetch(`/api/posts/${post.id}/bookmark`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setBookmarked(data.bookmarked);
        onUpdate();
      }
    } catch (error) {
      console.error("Error toggling bookmark:", error);
    } finally {
      setBookmarkLoading(false);
    }
  };

  const handlePinToggle = async () => {
    setPinLoading(true);
    try {
      const res = await fetch(`/api/posts/${post.id}/pin`, { method: "POST" });
      if (res.ok) {
        onPinToggle?.();
      } else {
        alert("Failed to update pin status");
      }
    } catch (error) {
      console.error("Pin toggle error:", error);
      alert("Failed to update pin status");
    } finally {
      setPinLoading(false);
    }
  };

  // ─── DOUBLE‑CLICK TO LIKE ──────────────────────────────────────────
  const handlePostClick = (e: React.MouseEvent) => {
    const now = Date.now();
    const timeSince = now - lastClickTime;
    setLastClickTime(now);
    if (timeSince < 300) handleLike();
  };

  let lastTouchTime = 0;
  const handleTouchEnd = () => {
    const now = Date.now();
    const timeSince = now - lastTouchTime;
    lastTouchTime = now;
    if (timeSince < 300) handleLike();
  };

  // ─── TIME AGO ──────────────────────────────────────────────────────
  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  const getInitial = () => {
    const name = post.author.name || post.author.username || "?";
    return name.charAt(0).toUpperCase();
  };

  return (
    <>
      <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm p-4 border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
        <div className="flex items-start gap-3">
          <Link href={`/profile/${post.author.username}`}>
            <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-300 font-semibold flex-shrink-0 overflow-hidden">
              {post.author.avatarUrl ? (
                <img
                  src={post.author.avatarUrl}
                  alt={post.author.name || post.author.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                getInitial()
              )}
            </div>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <Link href={`/profile/${post.author.username}`}>
                  <span className="font-semibold hover:underline text-gray-900 dark:text-white inline-flex items-center gap-1">
                    {post.author.name || post.author.username}
                    <VerifiedBadge badgeType={post.author.badgeType} />
                  </span>
                </Link>
                <Link href={`/profile/${post.author.username}`}>
                  <span className="text-gray-500 dark:text-gray-400 text-sm hover:underline">
                    @{post.author.username}
                  </span>
                </Link>
                <span className="text-gray-400 dark:text-gray-500 text-sm">·</span>
                <span className="text-gray-400 dark:text-gray-500 text-sm">{timeAgo(post.createdAt)}</span>

                {/* ─── Post type badge ─────────────────────────────────── */}
                {postType === "RECRUITMENT" && (
                  <span className="inline-flex items-center gap-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                    <Briefcase className="w-3 h-3" /> Recruitment
                  </span>
                )}
                {postType === "ARTICLE" && (
                  <span className="inline-flex items-center gap-1 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full">
                    <FileText className="w-3 h-3" /> Article
                  </span>
                )}
              </div>

              {isAuthor ? (
                <div className="flex items-center gap-1">
                  {showPinOption && (
                    <button
                      onClick={handlePinToggle}
                      disabled={pinLoading}
                      className={`transition p-1 ${isPinned ? "text-blue-500 hover:text-blue-600" : "text-gray-400 hover:text-blue-500"}`}
                      title={isPinned ? "Unpin from profile" : "Pin to profile"}
                    >
                      {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                    </button>
                  )}
                  <button onClick={() => setShowEditModal(true)} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition p-1">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => setShowDeleteConfirm(true)} className="text-gray-400 hover:text-red-500 transition p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button onClick={() => setShowReportModal(true)} className="text-gray-400 hover:text-red-500 transition p-1">
                  <Flag className="w-4 h-4" />
                </button>
              )}
            </div>

            {isRepost && originalAuthor && (
              <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-1">
                <Repeat className="w-3 h-3" />
                <span>
                  Reposted from{" "}
                  <Link href={`/profile/${originalAuthor.username}`} className="hover:underline text-zrp-red">
                    @{originalAuthor.username}
                  </Link>
                </span>
              </div>
            )}

            <div onClick={handlePostClick} onTouchEnd={handleTouchEnd} className="cursor-pointer select-none">
              <p className="text-gray-800 dark:text-gray-200 mt-1 whitespace-pre-wrap break-words">
                {contentParts.map((part, index) => {
                  if (part.type === "hashtag") {
                    const tag = part.value.slice(1);
                    return (
                      <Link key={index} href={`/hashtag/${tag}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                        {part.value}
                      </Link>
                    );
                  }
                  if (part.type === "mention") {
                    const username = part.value.slice(1);
                    return (
                      <Link key={index} href={`/profile/${username}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                        {part.value}
                      </Link>
                    );
                  }
                  return <span key={index}>{part.value}</span>;
                })}
              </p>

              {/* ─── Recruitment extra info ───────────────────────────── */}
              {postType === "RECRUITMENT" && (post.company || post.location || post.applyUrl) && (
                <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 space-y-1 text-sm">
                  {post.company && <p className="font-medium text-gray-900 dark:text-white">{post.company}</p>}
                  {post.location && <p className="text-gray-600 dark:text-gray-400">{post.location}</p>}
                  {post.applyUrl && (
                    <a
                      href={post.applyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block mt-1 text-zrp-red hover:underline text-sm font-medium"
                    >
                      Apply Now →
                    </a>
                  )}
                </div>
              )}

              {/* ─── Article body ─────────────────────────────────────── */}
              {postType === "ARTICLE" && post.body && (
                <div className="mt-2">
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    {articleExpanded ? (
                      <div
                        dangerouslySetInnerHTML={{ __html: post.body }}
                        className="text-gray-800 dark:text-gray-200"
                      />
                    ) : (
                      <div
                        dangerouslySetInnerHTML={{ __html: post.body.slice(0, 300) + (post.body.length > 300 ? "..." : "") }}
                        className="text-gray-800 dark:text-gray-200"
                      />
                    )}
                  </div>
                  {post.body.length > 300 && (
                    <button
                      onClick={() => setArticleExpanded(!articleExpanded)}
                      className="text-sm text-zrp-red hover:underline mt-1"
                    >
                      {articleExpanded ? "Show less" : "Read more"}
                    </button>
                  )}
                </div>
              )}

              {/* ─── Media rendering (image or video) ────────────────── */}
              {post.imageUrl && (
                <div
                  className="mt-2 rounded-lg overflow-hidden cursor-pointer group relative"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (video) {
                      if (videoRef.current) {
                        if (videoRef.current.paused) {
                          videoRef.current.play();
                        } else {
                          videoRef.current.pause();
                        }
                      }
                    } else {
                      setLightboxImage(post.imageUrl!);
                    }
                  }}
                >
                  {video ? (
                    <div className="relative aspect-video w-full bg-black">
                      <video
                        ref={videoRef}
                        src={post.imageUrl}
                        className="w-full h-full object-contain"
                        controls
                        playsInline
                        webkit-playsinline="true"
                        preload="metadata"
                        controlsList="nodownload noremoteplayback"
                        disablePictureInPicture
                        onPlay={() => setIsVideoPlaying(true)}
                        onPause={() => setIsVideoPlaying(false)}
                        onEnded={() => setIsVideoPlaying(false)}
                        onContextMenu={(e) => e.preventDefault()}
                        onError={(e) => {
                          const target = e.target as HTMLVideoElement;
                          target.style.display = 'none';
                          const img = document.createElement('img');
                          img.src = post.imageUrl!;
                          img.className = 'w-full h-full object-contain';
                          target.parentNode?.appendChild(img);
                        }}
                      />
                    </div>
                  ) : (
                    <>
                      <img src={post.imageUrl} alt="Post image" className="w-full" />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/20">
                        <ZoomIn className="w-8 h-8 text-white" />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* ─── ACTION BAR ──────────────────────────────────────────── */}
            <div className="flex items-center gap-4 mt-3 flex-wrap">
              <button
                onClick={handleLike}
                className={`flex items-center gap-1 text-sm ${liked ? "text-red-500" : "text-gray-500 dark:text-gray-400 hover:text-red-500"} transition`}
              >
                <Heart className={`w-4 h-4 ${liked ? "fill-red-500" : ""}`} />
                <span>{formatCount(likesCount)}</span>
              </button>

              {/* ─── Comment button (disabled if comments off) ─────────── */}
              <button
                onClick={() => setShowComments(!showComments)}
                className={`flex items-center gap-1 text-sm ${
                  commentsEnabled
                    ? "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                    : "text-gray-300 dark:text-gray-500 cursor-not-allowed opacity-50"
                } transition`}
                disabled={!commentsEnabled}
                title={!commentsEnabled ? "Comments are disabled for this post" : ""}
              >
                <MessageCircle className="w-4 h-4" />
                <span>{formatCount(post._count?.comments || 0)}</span>
              </button>

              {/* ─── Repost dropdown ───────────────────────────────────── */}
              <div className="relative">
                <button
                  onClick={() => setRepostDropdownOpen(!repostDropdownOpen)}
                  className={`flex items-center text-sm ${reposted ? "text-green-500" : "text-gray-500 dark:text-gray-400 hover:text-green-500"} transition`}
                >
                  <Repeat className={`w-4 h-4 ${reposted ? "fill-green-500" : ""}`} />
                  <ChevronDown className="w-3 h-3 ml-0.5" />
                </button>
                {repostDropdownOpen && (
                  <div className="absolute left-0 mt-1 w-32 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10">
                    {reposted ? (
                      <button
                        onClick={() => {
                          handleRepost();
                          setRepostDropdownOpen(false);
                        }}
                        className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                      >
                        Undo Repost
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          handleRepost();
                          setRepostDropdownOpen(false);
                        }}
                        className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                      >
                        Repost
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setShowQuoteModal(true);
                        setRepostDropdownOpen(false);
                      }}
                      className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                    >
                      Quote
                    </button>
                  </div>
                )}
              </div>

              {/* Repost count link */}
              <Link
                href={`/post/${post.id}/reposts`}
                className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"
              >
                <span className="font-medium">{formatCount(repostsCount)}</span>
              </Link>

              {/* Quotes count link */}
              <Link
                href={`/post/${post.id}/quotes`}
                className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"
              >
                <span className="font-medium">{formatCount(post._count?.quotedBy || 0)}</span>
              </Link>

              <span className="text-sm text-gray-400 dark:text-gray-500" title={`${viewsCount.toLocaleString()} views`}>
                <BarChart3 className="w-4 h-4 inline mr-1" />
                <span>{formatCount(viewsCount)}</span>
              </span>

              <button onClick={handleShare} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition">
                <Share2 className="w-4 h-4" />
              </button>

              <button
                onClick={handleBookmark}
                disabled={bookmarkLoading}
                className={`text-sm ${bookmarked ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white"} transition`}
                title={bookmarked ? "Remove bookmark" : "Bookmark"}
              >
                <Bookmark className={`w-4 h-4 ${bookmarked ? "fill-current" : ""}`} />
              </button>

              {/* ─── Comments disabled badge ───────────────────────────── */}
              {!commentsEnabled && (
                <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                  💬 Comments off
                </span>
              )}
            </div>

            {/* ─── REACTIONS ────────────────────────────────────────── */}
            {!reactionsLoading && (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {Object.entries(reactions)
                  .sort((a, b) => b[1] - a[1])
                  .map(([emoji, count]) => (
                    <button
                      key={emoji}
                      onClick={() => handleReaction(emoji)}
                      className={`text-sm px-2 py-1 rounded-full border transition ${
                        userReaction === emoji
                          ? "bg-zrp-red/10 border-zrp-red text-zrp-red"
                          : "bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700"
                      }`}
                    >
                      {emoji} <span className="ml-1 text-xs">{count}</span>
                    </button>
                  ))}
                <button
                  onClick={() => setShowEmojiPicker(true)}
                  className="text-sm px-2 py-1 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* ─── Inline comments ───────────────────────────────────── */}
            {commentsEnabled && showInlineComments && showComments && <Comments postId={post.id} onCommentAdded={onUpdate} />}
          </div>
        </div>
      </div>

      <EditPostModal post={post} isOpen={showEditModal} onClose={() => setShowEditModal(false)} onUpdate={onUpdate} />

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-xl max-w-sm w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Delete Post?</h2>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-full text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="bg-red-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition">
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ReportModal isOpen={showReportModal} onClose={() => setShowReportModal(false)} onSubmit={handleReport} />

      {/* ─── Image lightbox ──────────────────────────────────────────── */}
      {lightboxImage && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-[999] p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightboxImage}
              alt="Full size"
              className="w-full h-auto max-h-[90vh] object-contain rounded-lg"
            />
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute top-2 right-2 text-white bg-black/50 rounded-full p-2 hover:bg-black/70 transition"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}

      {showEmojiPicker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black/40" onClick={() => setShowEmojiPicker(false)}>
          <div className="w-full sm:w-auto max-h-[70vh] sm:max-h-[80vh] overflow-hidden rounded-t-2xl sm:rounded-xl bg-white dark:bg-zrp-deepBlack shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-end p-2 border-b border-gray-200 dark:border-gray-700">
              <button type="button" onClick={() => setShowEmojiPicker(false)} className="p-1 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <EmojiPicker onEmojiClick={(emoji) => handleReaction(emoji.emoji)} width="100%" height={380} />
          </div>
        </div>
      )}

      {/* ─── Quote Post Modal ────────────────────────────────────────── */}
      {showQuoteModal && (
        <QuotePostModal
          post={post}
          onClose={() => setShowQuoteModal(false)}
          onQuotePosted={onUpdate}
        />
      )}
    </>
  );
}
