"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Heart, MessageCircle, Repeat, Share2, Pencil, Trash2, Flag, Bookmark, BarChart3, Quote } from "lucide-react";
import { useSession } from "next-auth/react";
import Comments from "./Comments";
import EditPostModal from "./EditPostModal";
import ReportModal from "./ReportModal";
import VerifiedBadge from "./VerifiedBadge";
import QuoteModal from "./QuoteModal"; // ✅ new component (create it)

interface PostCardProps {
  post: {
    id: string;
    content: string;
    imageUrl?: string;
    createdAt: string;
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
      quotedBy?: number; // optional
    };
    liked?: boolean;
    // ✅ QUOTE REPOST
    quotePost?: PostCardProps["post"] | null;
  };
  onUpdate: () => void;
  isQuoted?: boolean; // to disable interactions if embedded
  depth?: number; // to limit nesting
}

// ─── PARSE HASHTAGS AND MENTIONS ──────────────────────────────────
function parseContent(content: string) {
  const parts: { type: "text" | "hashtag" | "mention"; value: string }[] = [];
  let remaining = content;
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
    parts.push({
      type: "text",
      value: content.slice(lastIndex),
    });
  }

  return parts;
}

// ─── FORMAT COUNTS LIKE X (1.2K, 3.4M) ─────────────────────────────
function formatCount(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toString();
}

export default function PostCard({
  post,
  onUpdate,
  isQuoted = false,
  depth = 0,
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

  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);

  // ─── QUOTE REPOST STATE ──────────────────────────────────────────
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const hasCountedView = useRef(false);

  const isAuthor = session?.user?.id === post.author.id;

  const contentParts = parseContent(post.content);

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

  // ─── Count a view once per mount, guarded against double-counting ───
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

  // ─── Like ──────────────────────────────────────────────────────────
  const handleLike = async () => {
    try {
      const res = await fetch(`/api/posts/${post.id}/like`, {
        method: "POST",
      });
      if (res.ok) {
        setLiked(!liked);
        setLikesCount(liked ? likesCount - 1 : likesCount + 1);
      }
    } catch (error) {
      console.error("Error liking post:", error);
    }
  };

  // ─── Repost ─────────────────────────────────────────────────────────
  const handleRepost = async () => {
    try {
      const res = await fetch(`/api/posts/${post.id}/repost`, {
        method: "POST",
      });
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

  // ─── Share ──────────────────────────────────────────────────────────
  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Post by ${post.author.name || post.author.username}`,
          text: post.content,
          url: url,
        });
      } catch (e) {
        // User cancelled
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        alert("Link copied to clipboard!");
      } catch (e) {
        alert("Share not supported on this device.");
      }
    }
  };

  // ─── Delete ─────────────────────────────────────────────────────────
  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/posts/${post.id}`, {
        method: "DELETE",
      });
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

  // ─── Report ─────────────────────────────────────────────────────────
  const handleReport = async (reason: string, details?: string) => {
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId: post.id,
          reason,
          details,
        }),
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

  // ─── Bookmark ──────────────────────────────────────────────────────
  const handleBookmark = async () => {
    setBookmarkLoading(true);
    try {
      const res = await fetch(`/api/posts/${post.id}/bookmark`, {
        method: "POST",
      });
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

  // ─── QUOTE REPOST HANDLERS ──────────────────────────────────────
  const handleQuote = () => {
    if (!session) {
      alert("Please log in to quote a post.");
      return;
    }
    setIsQuoteModalOpen(true);
  };

  const handleQuoteSubmit = async (quoteContent: string) => {
    setQuoteLoading(true);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: quoteContent,
          quotePostId: post.id,
          status: "published",
        }),
      });
      if (res.ok) {
        setIsQuoteModalOpen(false);
        onUpdate();
      } else {
        const error = await res.json();
        alert(error.error || "Failed to quote post.");
      }
    } catch (error) {
      console.error("Quote error:", error);
      alert("Failed to quote post.");
    } finally {
      setQuoteLoading(false);
    }
  };

  // ─── Time ago ──────────────────────────────────────────────────────
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
      <div
        className={`bg-white dark:bg-gray-900 rounded-lg shadow-sm p-4 border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition ${
          isQuoted ? "border-l-4 border-l-blue-500 bg-gray-50 dark:bg-gray-800/40" : ""
        }`}
      >
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
              </div>

              {!isQuoted && (
                <>
                  {isAuthor ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setShowEditModal(true)}
                        className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition p-1"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="text-gray-400 hover:text-red-500 transition p-1"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowReportModal(true)}
                      className="text-gray-400 hover:text-red-500 transition p-1"
                      title="Report"
                    >
                      <Flag className="w-4 h-4" />
                    </button>
                  )}
                </>
              )}
            </div>

            {/* ─── POST CONTENT WITH CLICKABLE HASHTAGS & MENTIONS ─── */}
            <p className="text-gray-800 dark:text-gray-200 mt-1 whitespace-pre-wrap break-words">
              {contentParts.map((part, index) => {
                if (part.type === "hashtag") {
                  const tag = part.value.slice(1);
                  return (
                    <Link
                      key={index}
                      href={`/hashtag/${tag}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {part.value}
                    </Link>
                  );
                }
                if (part.type === "mention") {
                  const username = part.value.slice(1);
                  return (
                    <Link
                      key={index}
                      href={`/profile/${username}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {part.value}
                    </Link>
                  );
                }
                return <span key={index}>{part.value}</span>;
              })}
            </p>

            {post.imageUrl && (
              <div className="mt-2 rounded-lg overflow-hidden">
                <img src={post.imageUrl} alt="Post image" className="w-full" />
              </div>
            )}

            {/* ─── QUOTED POST (if any) ────────────────────────────── */}
            {post.quotePost && depth < 2 && (
              <div className="mt-3 border-l-4 border-gray-300 dark:border-gray-600 pl-3">
                <PostCard
                  post={post.quotePost}
                  onUpdate={onUpdate}
                  isQuoted={true}
                  depth={depth + 1}
                />
              </div>
            )}
            {post.quotePost && depth >= 2 && (
              <div className="mt-3 text-sm text-gray-500 dark:text-gray-400 italic">
                <Link href={`/post/${post.quotePost.id}`} className="hover:underline">
                  View quoted post →
                </Link>
              </div>
            )}

            {/* ─── ACTIONS ──────────────────────────────────────────── */}
            {!isQuoted && (
              <div className="flex items-center gap-6 mt-3 flex-wrap">
                <button
                  onClick={handleLike}
                  className={`flex items-center gap-1 text-sm ${
                    liked ? "text-red-500" : "text-gray-500 dark:text-gray-400 hover:text-red-500"
                  } transition`}
                >
                  <Heart className={`w-4 h-4 ${liked ? "fill-red-500" : ""}`} />
                  <span>{formatCount(likesCount)}</span>
                </button>

                <button
                  onClick={() => setShowComments(!showComments)}
                  className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>{formatCount(post._count?.comments || 0)}</span>
                </button>

                <button
                  onClick={handleRepost}
                  className={`flex items-center gap-1 text-sm ${
                    reposted ? "text-green-500" : "text-gray-500 dark:text-gray-400 hover:text-green-500"
                  } transition`}
                >
                  <Repeat className={`w-4 h-4 ${reposted ? "fill-green-500" : ""}`} />
                  <span>{formatCount(repostsCount)}</span>
                </button>

                {/* ─── QUOTE BUTTON ────────────────────────────────── */}
                <button
                  onClick={handleQuote}
                  className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-400 transition"
                  title="Quote this post"
                >
                  <Quote className="w-4 h-4" />
                </button>

                <span
                  className="flex items-center gap-1 text-sm text-gray-400 dark:text-gray-500"
                  title={`${viewsCount.toLocaleString()} views`}
                >
                  <BarChart3 className="w-4 h-4" />
                  <span>{formatCount(viewsCount)}</span>
                </span>

                <button
                  onClick={handleShare}
                  className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition"
                >
                  <Share2 className="w-4 h-4" />
                </button>

                <button
                  onClick={handleBookmark}
                  disabled={bookmarkLoading}
                  className={`flex items-center gap-1 text-sm ${
                    bookmarked
                      ? "text-gray-900 dark:text-white"
                      : "text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white"
                  } transition`}
                  title={bookmarked ? "Remove bookmark" : "Bookmark"}
                >
                  <Bookmark className={`w-4 h-4 ${bookmarked ? "fill-current" : ""}`} />
                </button>
              </div>
            )}

            {showComments && (
              <Comments postId={post.id} onCommentAdded={onUpdate} />
            )}
          </div>
        </div>
      </div>

      <EditPostModal
        post={post}
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onUpdate={onUpdate}
      />

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-sm w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Delete Post?</h2>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">
              This action cannot be undone. Are you sure you want to delete this post?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-full text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="bg-red-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSubmit={handleReport}
      />

      {/* ─── QUOTE MODAL ────────────────────────────────────────────── */}
      <QuoteModal
        isOpen={isQuoteModalOpen}
        onClose={() => setIsQuoteModalOpen(false)}
        onSubmit={handleQuoteSubmit}
        originalPost={post}
        loading={quoteLoading}
      />
    </>
  );
}
