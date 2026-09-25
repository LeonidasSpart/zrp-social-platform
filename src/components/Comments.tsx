"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Send, Pencil, Trash2, X, Check, Reply, Heart, Repeat, Bookmark, Flag, Globe, Loader2, Image as ImageIcon, FileImage } from "lucide-react";
import VerifiedBadge from "./VerifiedBadge";
import { timeAgo } from "@/lib/utils";
import { getPlanLimits } from "@/lib/limits";
import ReportModal from "./ReportModal";
import GifPicker from "./GifPicker";
import { useLanguage } from "@/contexts/LanguageContext";
import ParsedContent from "@/components/ParsedContent";
import { localizeApiMessage } from "@/lib/api-error-i18n";
import { useAutoGrowTextarea, sizeTextareaToContent } from "@/hooks/useAutoGrowTextarea";
import { uploadFiles } from "@/lib/uploadthing-client";

interface Comment {
  id: string;
  content: string;
  imageUrl?: string | null;
  createdAt: string;
  author: {
    id: string;
    username: string;
    name: string;
    avatarUrl?: string | null;
    badgeType?: string | null;
  };
  replies: Comment[];
  parentId?: string | null;
  liked?: boolean;
  reposted?: boolean;
  bookmarked?: boolean;
  _count?: {
    likes: number;
    reposts: number;
    bookmarks: number;
  };
}

// A single flattened row: X never nests reply DOM inside reply DOM (which is
// what compounds indentation the deeper a thread goes). Instead every reply,
// no matter how deep in the tree, becomes a sibling row with one flat indent
// level and a "Replying to @x" label carrying the lost context.
interface FlatRow {
  comment: Comment;
  depth: number;
  parentAuthorUsername?: string;
}

function flattenThread(
  comment: Comment,
  depth = 0,
  parentAuthorUsername?: string
): FlatRow[] {
  const row: FlatRow = { comment, depth, parentAuthorUsername };
  const childRows = (comment.replies || []).flatMap((reply) =>
    flattenThread(reply, depth + 1, comment.author.username)
  );
  return [row, ...childRows];
}

// Comment content was previously rendered as raw plain text - any URL,
// #hashtag, or @mention typed into a comment just sat there as dead,
// unclickable text, unlike posts (which already parse and link all
// three via the same pattern below). This brings comments in line.
interface CommentsProps {
  postId: string;
  onCommentAdded: (delta?: number) => void;
}

export default function Comments({ postId, onCommentAdded }: CommentsProps) {
  const { data: session } = useSession();
  const plan = (session?.user?.plan as any) || "free";
  const limits = getPlanLimits(plan);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  // Hooks can only run from a real component - safe here since this
  // textarea is rendered once at this component's own top level (not
  // once per comment row, unlike the reply/edit textareas further down,
  // which use the plain sizeTextareaToContent() helper instead).
  const newCommentRef = useAutoGrowTextarea(newComment);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");

  // ─── Attach an image or GIF to a comment ────────────────────────────
  // Comment.imageUrl already existed in the schema and was already
  // rendered wherever a comment showed up (once added to this
  // component's own render below) - no composer anywhere ever wrote to
  // it. Single (non-map) state is correct for both: only one top-level
  // composer exists, and only one reply box can be open at a time
  // (replyingTo is a single id, not a set).
  const [newCommentImageUrl, setNewCommentImageUrl] = useState<string | null>(null);
  const [newCommentUploading, setNewCommentUploading] = useState(false);
  const [newCommentAttachError, setNewCommentAttachError] = useState<string | null>(null);
  const [showNewCommentGifPicker, setShowNewCommentGifPicker] = useState(false);
  const newCommentFileInputRef = useRef<HTMLInputElement>(null);

  const [replyImageUrl, setReplyImageUrl] = useState<string | null>(null);
  const [replyUploading, setReplyUploading] = useState(false);
  const [replyAttachError, setReplyAttachError] = useState<string | null>(null);
  const [showReplyGifPicker, setShowReplyGifPicker] = useState(false);
  const replyFileInputRef = useRef<HTMLInputElement>(null);

  const uploadCommentAttachment = async (
    file: File,
    setUrl: (url: string) => void,
    setUploading: (v: boolean) => void,
    setError: (v: string | null) => void
  ) => {
    setError(null);
    setUploading(true);
    try {
      const result = await uploadFiles("commentImage", { files: [file] });
      if (!result || result.length === 0) throw new Error("No file returned from upload");
      setUrl(result[0].ufsUrl);
    } catch (err) {
      console.error("Comment image upload error:", err);
      setError(t("comment.attachmentUploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editing, setEditing] = useState(false);

  // Comment image viewer - the URL alone, same pattern as
  // ChatInterface.tsx's lightboxImage (this component renders every
  // comment inline rather than as separate CommentItem instances, so
  // there's one viewer for the whole tree, not one per row).
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState<string | null>(null);

  const [showReportModal, setShowReportModal] = useState(false);
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(null);

  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // ─── Translation (per-comment, since many render at once here unlike
  // PostCard's single post - keyed by comment id) ────────────────────
  const { language: uiLanguage, t } = useLanguage();
  const [translatedMap, setTranslatedMap] = useState<Record<string, string>>({});
  const [showTranslationMap, setShowTranslationMap] = useState<Record<string, boolean>>({});
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const [translateErrorMap, setTranslateErrorMap] = useState<Record<string, boolean>>({});

  const handleTranslateComment = async (comment: Comment) => {
    if (translatedMap[comment.id]) {
      setShowTranslationMap((prev) => ({ ...prev, [comment.id]: !prev[comment.id] }));
      return;
    }
    setTranslatingId(comment.id);
    setTranslateErrorMap((prev) => ({ ...prev, [comment.id]: false }));
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: comment.content, targetLang: uiLanguage }),
      });
      if (res.ok) {
        const data = await res.json();
        setTranslatedMap((prev) => ({ ...prev, [comment.id]: data.translatedText }));
        setShowTranslationMap((prev) => ({ ...prev, [comment.id]: true }));
      } else {
        setTranslateErrorMap((prev) => ({ ...prev, [comment.id]: true }));
      }
    } catch (error) {
      console.error("Translate error:", error);
      setTranslateErrorMap((prev) => ({ ...prev, [comment.id]: true }));
    } finally {
      setTranslatingId(null);
    }
  };

  const fetchComments = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}/comments?limit=10`);
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments || []);
        setNextCursor(data.nextCursor || null);
      }
    } catch (error) {
      console.error("Error fetching comments:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreComments = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/posts/${postId}/comments?limit=10&cursor=${nextCursor}`);
      if (res.ok) {
        const data = await res.json();
        setComments((prev) => [...prev, ...(data.comments || [])]);
        setNextCursor(data.nextCursor || null);
      }
    } catch (error) {
      console.error("Error loading more comments:", error);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchComments();
  }, [postId]);

  // ─── Add top‑level comment ──────────────────────────────────────
  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault(); // ✅ Prevents page refresh
    if ((!newComment.trim() && !newCommentImageUrl) || !session) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newComment.trim(),
          imageUrl: newCommentImageUrl || undefined,
        }),
      });

      if (res.ok) {
        const created = await res.json();
        setNewComment("");
        setNewCommentImageUrl(null);
        setNewCommentAttachError(null);
        // Prepend directly instead of refetching - a full refetch would
        // reset pagination and drop any "load more" pages already loaded.
        setComments((prev) => [{ ...created, replies: created.replies || [] }, ...prev]);
        onCommentAdded(1); // Local count update only, never reloads the feed
      } else {
        // Was console-only: a rejected comment (rate limit, blocked,
        // disabled comments, too long) looked like a dead Send button.
        const data = await res.json().catch(() => ({}));
        alert(localizeApiMessage(data.error, t) || t("auth.errTryAgain"));
      }
    } catch (error) {
      console.error("Error posting comment:", error);
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Add reply to a comment ──────────────────────────────────────
  const handleReply = async (parentId: string) => {
    if ((!replyContent.trim() && !replyImageUrl) || !session) return;

    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: replyContent.trim(),
          parentId,
          imageUrl: replyImageUrl || undefined,
        }),
      });

      if (res.ok) {
        const created = await res.json();
        setReplyContent("");
        setReplyingTo(null);
        setReplyImageUrl(null);
        setReplyAttachError(null);
        updateCommentInTree(parentId, (c) => ({
          ...c,
          replies: [...(c.replies || []), { ...created, replies: [] }],
        }));
        onCommentAdded(1);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(localizeApiMessage(data.error, t) || t("auth.errTryAgain"));
      }
    } catch (error) {
      console.error("Error replying:", error);
    }
  };

  // ─── Start editing ──────────────────────────────────────────────
  const startEdit = (comment: Comment) => {
    setEditingId(comment.id);
    setEditContent(comment.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent("");
  };

  const saveEdit = async (commentId: string) => {
    if (!editContent.trim() || !session) return;

    setEditing(true);
    try {
      const res = await fetch(`/api/comments/${commentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent.trim() }),
      });

      if (res.ok) {
        const updated = await res.json();
        setEditingId(null);
        setEditContent("");
        updateCommentInTree(commentId, (c) => ({ ...c, content: updated.content }));
        onCommentAdded(0);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(localizeApiMessage(data.error, t) || t("comment.errUpdateFailed"));
      }
    } catch (error) {
      console.error("Error editing comment:", error);
      alert(t("comment.errUpdateFailed"));
    } finally {
      setEditing(false);
    }
  };

  // ─── Delete comment ──────────────────────────────────────────────
  const confirmDelete = (commentId: string) => {
    setCommentToDelete(commentId);
    setShowDeleteModal(true);
  };

  // Remove a comment (and its subtree, since deletion cascades in the DB)
  // from anywhere in the local tree without a full refetch.
  const removeCommentFromTree = (commentId: string) => {
    const walk = (list: Comment[]): Comment[] =>
      list
        .filter((c) => c.id !== commentId)
        .map((c) => (c.replies?.length ? { ...c, replies: walk(c.replies) } : c));
    setComments((prev) => walk(prev));
  };

  const handleDelete = async () => {
    if (!commentToDelete) return;

    try {
      const res = await fetch(`/api/comments/${commentToDelete}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setShowDeleteModal(false);
        removeCommentFromTree(commentToDelete);
        setCommentToDelete(null);
        onCommentAdded(-1);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(localizeApiMessage(data.error, t) || t("comment.errDeleteFailed"));
      }
    } catch (error) {
      console.error("Error deleting comment:", error);
      alert(t("comment.errDeleteFailed"));
    }
  };

  // ─── Report a comment ──────────────────────────────────────────────
  const openReportModal = (commentId: string) => {
    setReportingCommentId(commentId);
    setShowReportModal(true);
  };

  const handleReportComment = async (reason: string, details?: string) => {
    if (!reportingCommentId) return;
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId: reportingCommentId, reason, details }),
      });
      if (res.ok) {
        alert(t("comment.reportSubmitted"));
        setShowReportModal(false);
        setReportingCommentId(null);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(localizeApiMessage(err.error, t) || t("comment.errReportFailed"));
        // A 409 means it's already reported and pending - close the
        // modal rather than inviting a retry that would just repeat it.
        if (res.status === 409) {
          setShowReportModal(false);
          setReportingCommentId(null);
        }
      }
    } catch (error) {
      console.error("Error reporting comment:", error);
      alert(t("comment.errReportFailed"));
    }
  };

  const getAvatarSrc = (author: Comment["author"]) => {
    return author.avatarUrl || "/default-avatar.png";
  };

  // ─── Update a comment anywhere in the tree (top-level or nested) ──
  const updateCommentInTree = (
    commentId: string,
    updater: (comment: Comment) => Comment
  ) => {
    const walk = (list: Comment[]): Comment[] =>
      list.map((c) => {
        if (c.id === commentId) return updater(c);
        if (c.replies?.length) return { ...c, replies: walk(c.replies) };
        return c;
      });
    setComments((prev) => walk(prev));
  };

  // ─── Like / repost / bookmark a comment (optimistic, reverts on failure) ──
  const handleLikeComment = async (comment: Comment) => {
    if (!session) return;
    const wasLiked = !!comment.liked;
    updateCommentInTree(comment.id, (c) => ({
      ...c,
      liked: !wasLiked,
      _count: {
        likes: (c._count?.likes || 0) + (wasLiked ? -1 : 1),
        reposts: c._count?.reposts || 0,
        bookmarks: c._count?.bookmarks || 0,
      },
    }));
    try {
      const res = await fetch(`/api/comments/${comment.id}/like`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
    } catch {
      updateCommentInTree(comment.id, (c) => ({
        ...c,
        liked: wasLiked,
        _count: {
          likes: (c._count?.likes || 0) + (wasLiked ? 1 : -1),
          reposts: c._count?.reposts || 0,
          bookmarks: c._count?.bookmarks || 0,
        },
      }));
    }
  };

  const handleRepostComment = async (comment: Comment) => {
    if (!session) return;
    const wasReposted = !!comment.reposted;
    updateCommentInTree(comment.id, (c) => ({
      ...c,
      reposted: !wasReposted,
      _count: {
        likes: c._count?.likes || 0,
        reposts: (c._count?.reposts || 0) + (wasReposted ? -1 : 1),
        bookmarks: c._count?.bookmarks || 0,
      },
    }));
    try {
      const res = await fetch(`/api/comments/${comment.id}/repost`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
    } catch {
      updateCommentInTree(comment.id, (c) => ({
        ...c,
        reposted: wasReposted,
        _count: {
          likes: c._count?.likes || 0,
          reposts: (c._count?.reposts || 0) + (wasReposted ? 1 : -1),
          bookmarks: c._count?.bookmarks || 0,
        },
      }));
    }
  };

  const handleBookmarkComment = async (comment: Comment) => {
    if (!session) return;
    const wasBookmarked = !!comment.bookmarked;
    updateCommentInTree(comment.id, (c) => ({ ...c, bookmarked: !wasBookmarked }));
    try {
      const res = await fetch(`/api/comments/${comment.id}/bookmark`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
    } catch {
      updateCommentInTree(comment.id, (c) => ({ ...c, bookmarked: wasBookmarked }));
    }
  };

  const getDisplayName = (author: Comment["author"]) => {
    return author.name || author.username;
  };

  // ─── Render a single flat row (no recursive DOM nesting) ──────────
  const renderCommentRow = ({ comment, depth, parentAuthorUsername }: FlatRow) => {
    const isAuthor = session?.user?.id === comment.author.id;
    const isEditing = editingId === comment.id;
    const isReplying = replyingTo === comment.id;
    const isNested = depth > 0;

    return (
      <div
        key={comment.id}
        className={`flex gap-3 group ${isNested ? "ml-11" : ""}`}
      >
        {/* Avatar */}
        <Link
          href={`/profile/${comment.author.username}`}
          className="flex-shrink-0"
        >
          <div className={`${isNested ? "w-7 h-7" : "w-8 h-8"} rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 text-sm font-semibold overflow-hidden hover:ring-2 hover:ring-zrp-red transition`}>
            <img
              src={getAvatarSrc(comment.author)}
              alt={getDisplayName(comment.author)}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        </Link>

        <div className="flex-1 min-w-0">
          {depth > 1 && parentAuthorUsername && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">
              {t("profile.replyingTo")}{" "}
              <span className="text-zrp-red"><bdi>@{parentAuthorUsername}</bdi></span>
            </p>
          )}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Link
              href={`/profile/${comment.author.username}`}
              className="font-medium text-sm hover:underline text-gray-900 dark:text-white"
            >
              {getDisplayName(comment.author)}
            </Link>
            {comment.author.badgeType && (
              <VerifiedBadge badgeType={comment.author.badgeType} />
            )}
            <Link
              href={`/profile/${comment.author.username}`}
              className="text-xs text-gray-400 dark:text-gray-500 hover:underline"
            >
              <bdi>@{comment.author.username}</bdi>
            </Link>
            <span className="text-xs text-gray-400 dark:text-gray-500">·</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {timeAgo(comment.createdAt)}
            </span>

            {isAuthor && !isEditing && (
              <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => startEdit(comment)}
                  className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 p-1"
                  title={t("action.edit")}
                  aria-label={t("action.edit")}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => confirmDelete(comment.id)}
                  className="text-gray-400 hover:text-red-500 p-1"
                  title={t("action.delete")}
                  aria-label={t("action.delete")}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {!isAuthor && session && !isEditing && (
              <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => openReportModal(comment.id)}
                  className="text-gray-400 hover:text-red-500 p-1"
                  title={t("report.modalTitle")}
                  aria-label={t("report.modalTitle")}
                >
                  <Flag className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
          {isEditing ? (
            <div className="mt-1 flex items-end gap-2">
              <textarea
                ref={(el) => sizeTextareaToContent(el)}
                value={editContent}
                onChange={(e) => {
                  setEditContent(e.target.value);
                  sizeTextareaToContent(e.target);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    saveEdit(comment.id);
                  }
                }}
                aria-label={t("action.edit")}
                rows={2}
                className="flex-1 min-w-0 px-3 py-2 text-base border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red resize-none overflow-y-auto max-h-52"
                autoFocus
                maxLength={limits.postLength}
              />
              <button
                onClick={() => saveEdit(comment.id)}
                disabled={!editContent.trim() || editing}
                className="flex-shrink-0 text-green-600 hover:text-green-700 p-1 disabled:opacity-50"
                title={t("action.save")}
                aria-label={t("action.save")}
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={cancelEdit}
                className="flex-shrink-0 text-gray-400 hover:text-gray-600 p-1"
                title={t("action.cancel")}
                aria-label={t("action.cancel")}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              {comment.content && (
                <p className="text-sm text-gray-800 dark:text-gray-200 mt-0.5 whitespace-pre-wrap break-words">
                  <ParsedContent content={comment.content} urlClassName="text-zrp-red hover:underline break-all" />
                </p>
              )}
              {comment.imageUrl && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setViewingImageUrl(comment.imageUrl!);
                  }}
                  className="mt-2 block rounded-lg overflow-hidden max-h-64 inline-block cursor-zoom-in"
                  aria-label={t("comment.viewImage")}
                >
                  <img
                    src={comment.imageUrl}
                    alt=""
                    className="max-h-64 w-auto object-cover rounded-lg"
                    loading="lazy"
                  />
                </button>
              )}
            </>
          )}

          {/* ─── Translate comment ─────────────────────────────────── */}
          {!isEditing && comment.content.trim().length > 0 && (
            <div className="mt-1">
              <button
                onClick={() => handleTranslateComment(comment)}
                disabled={translatingId === comment.id}
                className="inline-flex items-center gap-1 text-xs text-zrp-red hover:underline disabled:opacity-60"
              >
                {translatingId === comment.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Globe className="w-3 h-3" />
                )}
                {showTranslationMap[comment.id] ? t("comment.showOriginal") : t("comment.showTranslation")}
              </button>
              {translateErrorMap[comment.id] && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {t("comment.translationUnavailable")}
                </p>
              )}
              {showTranslationMap[comment.id] && translatedMap[comment.id] && (
                <p className="text-sm text-gray-800 dark:text-gray-200 mt-1 whitespace-pre-wrap break-words border-l-2 border-gray-200 dark:border-gray-700 pl-2">
                  {translatedMap[comment.id]}
                </p>
              )}
            </div>
          )}

          {!isEditing && (
            <div className="flex items-center gap-4 mt-1">
              <button
                onClick={() => {
                  setReplyingTo(replyingTo === comment.id ? null : comment.id);
                  setReplyContent("");
                  setReplyImageUrl(null);
                  setReplyAttachError(null);
                }}
                className="text-xs text-gray-400 hover:text-zrp-red transition flex items-center gap-1 whitespace-nowrap"
              >
                <Reply className="w-3.5 h-3.5" />
                {comment.replies?.length ? comment.replies.length : ""}
              </button>

              <button
                onClick={() => handleRepostComment(comment)}
                disabled={!session}
                className={`text-xs transition flex items-center gap-1 whitespace-nowrap ${
                  comment.reposted
                    ? "text-green-500"
                    : "text-gray-400 hover:text-green-500"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={t("action.repost")}
                aria-label={t("action.repost")}
              >
                <Repeat className="w-3.5 h-3.5" />
                {comment._count?.reposts ? comment._count.reposts : ""}
              </button>

              <button
                onClick={() => handleLikeComment(comment)}
                disabled={!session}
                className={`text-xs transition flex items-center gap-1 whitespace-nowrap ${
                  comment.liked
                    ? "text-red-500"
                    : "text-gray-400 hover:text-red-500"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={t("action.like")}
                aria-label={t("action.like")}
              >
                <Heart className={`w-3.5 h-3.5 ${comment.liked ? "fill-red-500" : ""}`} />
                {comment._count?.likes ? comment._count.likes : ""}
              </button>

              <button
                onClick={() => handleBookmarkComment(comment)}
                disabled={!session}
                className={`text-xs transition flex items-center gap-1 whitespace-nowrap ${
                  comment.bookmarked
                    ? "text-zrp-red"
                    : "text-gray-400 hover:text-zrp-red"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={t("nav.bookmarks")}
                aria-label={t("nav.bookmarks")}
              >
                <Bookmark className={`w-3.5 h-3.5 ${comment.bookmarked ? "fill-zrp-red" : ""}`} />
              </button>
            </div>
          )}

          {isReplying && (
            <div className="mt-2">
              {replyImageUrl && (
                <div className="relative mb-2 inline-block">
                  <img
                    src={replyImageUrl}
                    alt=""
                    className="max-h-32 rounded-xl border border-gray-200 dark:border-gray-700 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setReplyImageUrl(null)}
                    aria-label={t("comment.removeAttachment")}
                    className="absolute -top-2 -right-2 flex items-center justify-center w-6 h-6 rounded-full bg-black/70 text-white hover:bg-black/90 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {replyAttachError && (
                <p role="alert" aria-live="polite" className="text-xs text-red-500 mb-1">
                  {replyAttachError}
                </p>
              )}
              <div className="flex items-end gap-2">
              <textarea
                ref={(el) => sizeTextareaToContent(el)}
                value={replyContent}
                onChange={(e) => {
                  setReplyContent(e.target.value);
                  sizeTextareaToContent(e.target);
                }}
                placeholder={t("comment.replyToPlaceholder", { name: comment.author.name || comment.author.username })}
                aria-label={t("comment.replyToPlaceholder", { name: comment.author.name || comment.author.username })}
                rows={2}
                className="flex-1 min-w-0 px-3 py-2 text-base border border-gray-300 dark:border-gray-600 rounded-2xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-zrp-red focus:border-transparent resize-none overflow-y-auto max-h-52"
                maxLength={limits.postLength}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleReply(comment.id);
                  }
                }}
              />
              <label
                className={`flex-shrink-0 p-1.5 transition ${
                  replyUploading || !!replyImageUrl
                    ? "cursor-not-allowed opacity-40"
                    : "cursor-pointer text-gray-400 hover:text-zrp-red"
                }`}
                title={t("comment.addImage")}
              >
                <input
                  ref={replyFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadCommentAttachment(file, setReplyImageUrl, setReplyUploading, setReplyAttachError);
                    if (replyFileInputRef.current) replyFileInputRef.current.value = "";
                  }}
                  disabled={replyUploading || !!replyImageUrl}
                  className="hidden"
                />
                {replyUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ImageIcon className="w-4 h-4" />
                )}
              </label>
              <button
                type="button"
                onClick={() => setShowReplyGifPicker(true)}
                disabled={replyUploading || !!replyImageUrl}
                title={t("composer.addGif")}
                aria-label={t("composer.addGif")}
                className="flex-shrink-0 p-1.5 text-gray-400 hover:text-zrp-red disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <FileImage className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleReply(comment.id)}
                disabled={!replyContent.trim() && !replyImageUrl}
                className="flex-shrink-0 whitespace-nowrap px-3 py-1.5 bg-zrp-red text-white rounded-full text-sm font-medium hover:bg-zrp-darkRed disabled:opacity-50 transition"
              >
                {t("action.reply")}
              </button>
              <button
                onClick={() => {
                  setReplyingTo(null);
                  setReplyContent("");
                  setReplyImageUrl(null);
                  setReplyAttachError(null);
                }}
                className="flex-shrink-0 whitespace-nowrap text-gray-400 hover:text-gray-600 text-sm"
              >
                {t("action.cancel")}
              </button>
              </div>
              {showReplyGifPicker && (
                <GifPicker
                  onSelect={(url) => {
                    setReplyImageUrl(url);
                    setShowReplyGifPicker(false);
                  }}
                  onClose={() => setShowReplyGifPicker(false)}
                />
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="mt-3 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-24 bg-zinc-200 dark:bg-zinc-700 rounded" />
              <div className="h-3 w-full bg-zinc-200 dark:bg-zinc-700 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
      {comments.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("comment.noneYet")}</p>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {comments.map((comment) => (
            <div key={comment.id} className="py-3 first:pt-0 last:pb-0 space-y-3">
              {flattenThread(comment).map((row) => renderCommentRow(row))}
            </div>
          ))}
          {nextCursor && (
            <div className="pt-3 first:pt-0">
              <button
                onClick={loadMoreComments}
                disabled={loadingMore}
                className="text-sm text-zrp-red hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingMore ? t("action.loading") : t("comment.loadMore")}
              </button>
            </div>
          )}
        </div>
      )}

      {session && !replyingTo && (
        <form onSubmit={handleSubmit} className="mt-3">
          {newCommentImageUrl && (
            <div className="relative mb-2 inline-block">
              <img
                src={newCommentImageUrl}
                alt=""
                className="max-h-40 rounded-xl border border-gray-200 dark:border-gray-700 object-cover"
              />
              <button
                type="button"
                onClick={() => setNewCommentImageUrl(null)}
                aria-label={t("comment.removeAttachment")}
                className="absolute -top-2 -right-2 flex items-center justify-center w-6 h-6 rounded-full bg-black/70 text-white hover:bg-black/90 transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {newCommentAttachError && (
            <p role="alert" aria-live="polite" className="text-xs text-red-500 mb-1">
              {newCommentAttachError}
            </p>
          )}
          <div className="flex gap-2 items-end">
          <textarea
            ref={newCommentRef}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={t("postDetail.commentPlaceholder")}
            aria-label={t("postDetail.commentPlaceholder")}
            rows={2}
            // text-base (16px), not text-sm (14px): below 16px, iOS
            // Safari zooms the whole page in on focus, which is itself
            // a real contributor to "I can't see what I'm typing" on
            // mobile - confirmed user feedback this size increase
            // directly addresses, not a cosmetic guess.
            className="flex-1 min-w-0 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-2xl text-base focus:outline-none focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none overflow-y-auto max-h-52"
            maxLength={limits.postLength}
          />
          <label
            className={`flex-shrink-0 p-2 transition ${
              newCommentUploading || !!newCommentImageUrl
                ? "cursor-not-allowed opacity-40"
                : "cursor-pointer text-gray-500 dark:text-gray-400 hover:text-zrp-red"
            }`}
            title={t("comment.addImage")}
          >
            <input
              ref={newCommentFileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadCommentAttachment(file, setNewCommentImageUrl, setNewCommentUploading, setNewCommentAttachError);
                if (newCommentFileInputRef.current) newCommentFileInputRef.current.value = "";
              }}
              disabled={newCommentUploading || !!newCommentImageUrl}
              className="hidden"
            />
            {newCommentUploading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <ImageIcon className="w-5 h-5" />
            )}
          </label>
          <button
            type="button"
            onClick={() => setShowNewCommentGifPicker(true)}
            disabled={newCommentUploading || !!newCommentImageUrl}
            title={t("composer.addGif")}
            aria-label={t("composer.addGif")}
            className="flex-shrink-0 p-2 text-gray-500 dark:text-gray-400 hover:text-zrp-red disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <FileImage className="w-5 h-5" />
          </button>
          <button
            type="submit"
            disabled={(!newComment.trim() && !newCommentImageUrl) || submitting}
            className="flex-shrink-0 whitespace-nowrap bg-zrp-red text-white px-4 py-1.5 rounded-full text-sm font-medium hover:bg-zrp-darkRed disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-1"
          >
            <Send className="w-4 h-4" />
            {t("action.reply")}
          </button>
          </div>
        </form>
      )}

      {showNewCommentGifPicker && (
        <GifPicker
          onSelect={(url) => {
            setNewCommentImageUrl(url);
            setShowNewCommentGifPicker(false);
          }}
          onClose={() => setShowNewCommentGifPicker(false)}
        />
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-sm w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              {t("comment.deleteTitle")}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">
              {t("comment.deleteBody")}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setCommentToDelete(null);
                }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-full text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition"
              >
                {t("action.cancel")}
              </button>
              <button
                onClick={handleDelete}
                className="bg-red-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-red-700 transition"
              >
                {t("action.delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      <ReportModal
        isOpen={showReportModal}
        onClose={() => {
          setShowReportModal(false);
          setReportingCommentId(null);
        }}
        onSubmit={handleReportComment}
      />

      {/* ─── Comment image viewer ──────────────────────────────────── */}
      {/* A fixed overlay, not a route change - closing it leaves this
          page's scroll position and comment tree untouched, matching
          the same pattern PostCard.tsx and ChatInterface.tsx already
          use for post/message image lightboxes. */}
      {viewingImageUrl && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center bg-black/90 p-3 sm:p-6"
          onClick={() => setViewingImageUrl(null)}
        >
          <div
            className="relative flex h-full max-h-[92vh] w-full max-w-5xl items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={viewingImageUrl}
              alt="Comment image"
              className="max-h-full max-w-full rounded-lg object-contain"
            />
            <button
              type="button"
              onClick={() => setViewingImageUrl(null)}
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
