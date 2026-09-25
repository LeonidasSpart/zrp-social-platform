"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Heart,
  MessageCircle,
  Repeat,
  Bookmark,
  Share2,
  Pencil,
  Trash2,
  X,
  Check,
  Globe,
  Loader2,
} from "lucide-react";
import { useSession } from "next-auth/react";
import VerifiedBadge from "./VerifiedBadge"; // ✅ import
import { useLanguage } from "@/contexts/LanguageContext";
import { getDateLocale } from "@/lib/dateLocale";
import ParsedContent from "@/components/ParsedContent";
import { useAutoGrowTextarea } from "@/hooks/useAutoGrowTextarea";

interface Comment {
  id: string;
  content: string;
  imageUrl?: string;
  createdAt: string;
  postId: string;
  author: {
    id: string;
    username: string;
    name: string;
    avatarUrl?: string;
    badgeType?: string | null; // ✅ added
  };
  parentId?: string;
  replies?: Comment[];
  _count?: {
    likes: number;
    reposts: number;
    bookmarks: number;
  };
  liked?: boolean;
  reposted?: boolean;
  bookmarked?: boolean;
}

interface CommentItemProps {
  comment: Comment;
  onReply: (commentId: string) => void;
  onUpdate: () => void;
  isReply?: boolean;
}

export default function CommentItem({
  comment,
  onReply,
  onUpdate,
  isReply = false,
}: CommentItemProps) {
  const { data: session } = useSession();
  const { t, language } = useLanguage();
  const [liked, setLiked] = useState(comment.liked || false);
  const [likesCount, setLikesCount] = useState(comment._count?.likes || 0);

  // `useState`'s initial value only runs on this component's FIRST
  // mount - if the same CommentItem instance stays mounted while its
  // parent legitimately refetches this thread (onUpdate, a background
  // refresh) and gets a genuinely different `liked`/like-count from the
  // server, this local state would otherwise silently ignore that
  // update forever, since handleLike below only ever calls
  // setLiked/setLikesCount itself (never re-derives from props again).
  // Safe to resync unconditionally: handleLike is non-optimistic (only
  // touches this state after a confirmed `res.ok`), so there's never a
  // pending local mutation these effects could clobber.
  useEffect(() => {
    setLiked(comment.liked || false);
  }, [comment.id, comment.liked]);

  useEffect(() => {
    setLikesCount(comment._count?.likes || 0);
  }, [comment.id, comment._count?.likes]);
  const [reposted, setReposted] = useState(comment.reposted || false);
  const [repostsCount, setRepostsCount] = useState(comment._count?.reposts || 0);
  const [bookmarked, setBookmarked] = useState(comment.bookmarked || false);
  const [bookmarksCount, setBookmarksCount] = useState(comment._count?.bookmarks || 0);
  const [loading, setLoading] = useState({
    like: false,
    repost: false,
    bookmark: false,
    delete: false,
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const editContentRef = useAutoGrowTextarea(editContent);
  const [savingEdit, setSavingEdit] = useState(false);

  // ─── Comment image lightbox ─────────────────────────────────────
  // Comments carry at most one image, so a boolean is enough - unlike
  // PostCard.tsx's multi-image gallery (index-based) or
  // ChatInterface.tsx's per-message lightbox (keyed by URL), there's
  // never more than one image to distinguish here.
  const [showImageViewer, setShowImageViewer] = useState(false);

  const isAuthor = session?.user?.id === comment.author.id;

  // ─── Translation ─────────────────────────────────────────────────
  // Same /api/translate flow PostCard.tsx and Comments.tsx already use -
  // this component (used by the post detail page, src/app/post/[id])
  // never had it, so a reply there had no "Show translation" affordance
  // even though the parent post and every other comment surface did.
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState(false);

  const handleTranslate = async () => {
    if (translatedText) {
      setShowTranslation(!showTranslation);
      return;
    }
    setTranslating(true);
    setTranslateError(false);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: comment.content, targetLang: language }),
      });
      if (res.ok) {
        const data = await res.json();
        setTranslatedText(data.translatedText);
        setShowTranslation(true);
      } else {
        setTranslateError(true);
      }
    } catch (error) {
      console.error("Translate error:", error);
      setTranslateError(true);
    } finally {
      setTranslating(false);
    }
  };

  const handleLike = async () => {
    if (!session || loading.like) return;
    setLoading({ ...loading, like: true });
    try {
      const res = await fetch(`/api/comments/${comment.id}/like`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setLiked(data.liked);
        setLikesCount((prev) => (data.liked ? prev + 1 : prev - 1));
        onUpdate();
      }
    } catch (error) { console.error(error); }
    finally { setLoading({ ...loading, like: false }); }
  };

  const handleRepost = async () => {
    if (!session || loading.repost) return;
    setLoading({ ...loading, repost: true });
    try {
      const res = await fetch(`/api/comments/${comment.id}/repost`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setReposted(data.reposted);
        setRepostsCount((prev) => (data.reposted ? prev + 1 : prev - 1));
        onUpdate();
      }
    } catch (error) { console.error(error); }
    finally { setLoading({ ...loading, repost: false }); }
  };

  const handleBookmark = async () => {
    if (!session || loading.bookmark) return;
    setLoading({ ...loading, bookmark: true });
    try {
      const res = await fetch(`/api/comments/${comment.id}/bookmark`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setBookmarked(data.bookmarked);
        setBookmarksCount((prev) => (data.bookmarked ? prev + 1 : prev - 1));
        onUpdate();
      }
    } catch (error) { console.error(error); }
    finally { setLoading({ ...loading, bookmark: false }); }
  };

  const handleShare = () => {
    // ?commentId= is the one cross-platform target format: the post
    // page's own scroll-to-comment logic reads it (see
    // src/app/post/[id]/page.tsx), it's what comment/reply push
    // notifications carry, and - unlike a #hash fragment - it's what
    // Android's and iOS's native deep-link matchers can actually pattern
    // against.
    const url = `${window.location.origin}/post/${comment.postId}?commentId=${comment.id}`;
    if (navigator.share) {
      navigator.share({ title: "Comment on ZRP", text: comment.content, url });
    } else {
      navigator.clipboard.writeText(url).then(() => alert(t("comment.linkCopied")));
    }
  };

  const handleEdit = async () => {
    if (!editContent.trim()) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/comments/${comment.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent }),
      });
      if (res.ok) {
        setIsEditing(false);
        onUpdate();
      } else {
        alert(t("comment.errEditFailed"));
      }
    } catch (error) { console.error(error); alert(t("comment.errEditFailed")); }
    finally { setSavingEdit(false); }
  };

  const handleDelete = async () => {
    if (!confirm(t("comment.deleteConfirmPrompt"))) return;
    setLoading({ ...loading, delete: true });
    try {
      const res = await fetch(`/api/comments/${comment.id}`, { method: "DELETE" });
      if (res.ok) {
        onUpdate();
      } else {
        alert(t("comment.errDeleteFailed"));
      }
    } catch (error) { console.error(error); alert(t("comment.errDeleteFailed")); }
    finally { setLoading({ ...loading, delete: false }); }
  };

  return (
    // id is the single authoritative scroll/highlight target for this
    // comment at ANY depth - a reply rendered here recursively (see
    // below) gets its own id the same way, unlike the old approach
    // which only ever registered a ref for a top-level comment in the
    // parent page and left every reply unreachable by id.
    <div className="relative" id={`comment-${comment.id}`}>
      <div
        className={`
          flex items-start gap-3 py-3
          ${!isReply ? "border-b border-gray-200 dark:border-gray-700" : ""}
          hover:bg-gray-50 dark:hover:bg-gray-800/30 transition
          px-2 -mx-2 rounded-lg
        `}
      >
        {/* Avatar */}
        <Link href={`/profile/${comment.author.username}`} className="flex-shrink-0">
          <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            {comment.author.avatarUrl ? (
              <img
                src={comment.author.avatarUrl}
                alt={comment.author.name || comment.author.username}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold text-sm">
                {(comment.author.name || comment.author.username)[0].toUpperCase()}
              </div>
            )}
          </div>
        </Link>

        <div className="flex-1 min-w-0">
          {/* Header with badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/profile/${comment.author.username}`}
              className="font-semibold hover:underline text-gray-900 dark:text-white text-sm flex items-center gap-1"
            >
              {comment.author.name || comment.author.username}
              {comment.author.badgeType && <VerifiedBadge badgeType={comment.author.badgeType} />}
            </Link>
            <Link
              href={`/profile/${comment.author.username}`}
              className="text-xs text-gray-500 hover:underline"
            >
              <bdi>@{comment.author.username}</bdi>
            </Link>
            <span className="text-xs text-gray-400">·</span>
            <span className="text-xs text-gray-400">
              {new Date(comment.createdAt).toLocaleDateString(getDateLocale(language))}
            </span>
          </div>

          {/* Content (editable) */}
          {isEditing ? (
            <div className="mt-1 flex items-start gap-2">
              <textarea
                ref={editContentRef}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                aria-label={t("action.edit")}
                className="flex-1 px-3 py-2 text-base border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none overflow-y-auto max-h-52"
                rows={2}
                autoFocus
              />
              <button
                onClick={handleEdit}
                disabled={savingEdit || !editContent.trim()}
                aria-label={t("action.save")}
                className="p-1 text-green-500 hover:text-green-600 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditContent(comment.content);
                }}
                aria-label={t("action.cancel")}
                className="p-1 text-gray-500 hover:text-gray-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <p className="mt-0.5 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
                <ParsedContent content={comment.content} />
              </p>
              {comment.imageUrl && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowImageViewer(true);
                  }}
                  className="mt-2 block rounded-lg overflow-hidden max-h-40 cursor-zoom-in"
                  aria-label={t("comment.viewImage")}
                >
                  <img
                    src={comment.imageUrl}
                    alt="Comment image"
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </button>
              )}

              {/* ─── Translate comment ─────────────────────────────── */}
              {comment.content.trim().length > 0 && (
                <div className="mt-1">
                  <button
                    onClick={handleTranslate}
                    disabled={translating}
                    className="inline-flex items-center gap-1 text-xs text-zrp-red hover:underline disabled:opacity-60"
                  >
                    {translating ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Globe className="w-3 h-3" />
                    )}
                    {showTranslation ? t("comment.showOriginal") : t("comment.showTranslation")}
                  </button>
                  {translateError && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {t("comment.translationUnavailable")}
                    </p>
                  )}
                  {showTranslation && translatedText && (
                    <p className="text-sm text-gray-800 dark:text-gray-200 mt-1 whitespace-pre-wrap break-words border-s-2 border-gray-200 dark:border-gray-700 ps-2">
                      {translatedText}
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-4 mt-1.5 flex-wrap">
            <button
              onClick={handleLike}
              disabled={loading.like}
              aria-label={t("action.like")}
              aria-pressed={liked}
              className={`flex items-center gap-1 text-xs transition ${
                liked ? "text-red-500" : "text-gray-500 hover:text-red-500"
              }`}
            >
              <Heart className={`w-3.5 h-3.5 ${liked ? "fill-red-500" : ""}`} />
              {likesCount > 0 && <span className="font-medium">{likesCount}</span>}
            </button>

            <button
              onClick={() => onReply(comment.id)}
              aria-label={t("action.reply")}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-zrp-red transition"
            >
              <MessageCircle className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handleRepost}
              disabled={loading.repost}
              aria-label={t("action.repost")}
              aria-pressed={reposted}
              className={`flex items-center gap-1 text-xs transition ${
                reposted ? "text-green-500" : "text-gray-500 hover:text-green-500"
              }`}
            >
              <Repeat className={`w-3.5 h-3.5 ${reposted ? "fill-green-500" : ""}`} />
              {repostsCount > 0 && <span className="font-medium">{repostsCount}</span>}
            </button>

            <button
              onClick={handleBookmark}
              disabled={loading.bookmark}
              aria-label={t("nav.bookmarks")}
              aria-pressed={bookmarked}
              className={`flex items-center gap-1 text-xs transition ${
                bookmarked ? "text-blue-500" : "text-gray-500 hover:text-blue-500"
              }`}
            >
              <Bookmark className={`w-3.5 h-3.5 ${bookmarked ? "fill-blue-500" : ""}`} />
              {bookmarksCount > 0 && <span className="font-medium">{bookmarksCount}</span>}
            </button>

            <button
              onClick={handleShare}
              aria-label={t("post.share")}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition"
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>

            {/* Edit / Delete (own comments only) */}
            {isAuthor && !isEditing && (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-gray-400 hover:text-gray-600 transition"
                  title={t("action.edit")}
                  aria-label={t("action.edit")}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleDelete}
                  disabled={loading.delete}
                  className="text-gray-400 hover:text-red-500 transition"
                  title={t("action.delete")}
                  aria-label={t("action.delete")}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Nested replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="ml-8 border-l-2 border-gray-200 dark:border-gray-700 pl-4 space-y-0">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              onReply={onReply}
              onUpdate={onUpdate}
              isReply={true}
            />
          ))}
        </div>
      )}

      {/* ─── Comment image viewer ──────────────────────────────────── */}
      {/* A fixed overlay, not a route change - closing it leaves this
          comment's DOM node (and the page's scroll position) untouched,
          matching the same pattern PostCard.tsx and ChatInterface.tsx
          already use for post/message image lightboxes. */}
      {showImageViewer && comment.imageUrl && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center bg-black/90 p-3 sm:p-6"
          onClick={() => setShowImageViewer(false)}
        >
          <div
            className="relative flex h-full max-h-[92vh] w-full max-w-5xl items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={comment.imageUrl}
              alt="Comment image"
              className="max-h-full max-w-full rounded-lg object-contain"
            />
            <button
              type="button"
              onClick={() => setShowImageViewer(false)}
              className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80 sm:right-2 sm:top-2"
              aria-label={t("comment.closeImage")}
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
