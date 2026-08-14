"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Send, Pencil, Trash2, X, Check, Reply, Heart, Repeat, Bookmark, Flag } from "lucide-react";
import VerifiedBadge from "./VerifiedBadge";
import { timeAgo } from "@/lib/utils";
import { getPlanLimits } from "@/lib/limits";
import ReportModal from "./ReportModal";

interface Comment {
  id: string;
  content: string;
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
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editing, setEditing] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState<string | null>(null);

  const [showReportModal, setShowReportModal] = useState(false);
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(null);

  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

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
    if (!newComment.trim() || !session) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newComment.trim() }),
      });

      if (res.ok) {
        const created = await res.json();
        setNewComment("");
        // Prepend directly instead of refetching - a full refetch would
        // reset pagination and drop any "load more" pages already loaded.
        setComments((prev) => [{ ...created, replies: created.replies || [] }, ...prev]);
        onCommentAdded(1); // Local count update only, never reloads the feed
      } else {
        console.error("Failed to post comment");
      }
    } catch (error) {
      console.error("Error posting comment:", error);
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Add reply to a comment ──────────────────────────────────────
  const handleReply = async (parentId: string) => {
    if (!replyContent.trim() || !session) return;

    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: replyContent.trim(),
          parentId,
        }),
      });

      if (res.ok) {
        const created = await res.json();
        setReplyContent("");
        setReplyingTo(null);
        updateCommentInTree(parentId, (c) => ({
          ...c,
          replies: [...(c.replies || []), { ...created, replies: [] }],
        }));
        onCommentAdded(1);
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
      }
    } catch (error) {
      console.error("Error editing comment:", error);
      alert("Failed to update comment");
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
      }
    } catch (error) {
      console.error("Error deleting comment:", error);
      alert("Failed to delete comment");
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
        alert("Report submitted. Thank you for helping keep the community safe.");
        setShowReportModal(false);
        setReportingCommentId(null);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Failed to submit report. Please try again.");
        // A 409 means it's already reported and pending - close the
        // modal rather than inviting a retry that would just repeat it.
        if (res.status === 409) {
          setShowReportModal(false);
          setReportingCommentId(null);
        }
      }
    } catch (error) {
      console.error("Error reporting comment:", error);
      alert("Failed to submit report. Please try again.");
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
            />
          </div>
        </Link>

        <div className="flex-1 min-w-0">
          {depth > 1 && parentAuthorUsername && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">
              Replying to{" "}
              <span className="text-zrp-red">@{parentAuthorUsername}</span>
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
            <span className="text-xs text-gray-400 dark:text-gray-500">
              @{comment.author.username}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">·</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {timeAgo(comment.createdAt)}
            </span>

            {isAuthor && !isEditing && (
              <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => startEdit(comment)}
                  className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 p-1"
                  title="Edit comment"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => confirmDelete(comment.id)}
                  className="text-gray-400 hover:text-red-500 p-1"
                  title="Delete comment"
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
                  title="Report comment"
                >
                  <Flag className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
          {isEditing ? (
            <div className="mt-1 flex items-end gap-2">
              <textarea
                value={editContent}
                onChange={(e) => {
                  setEditContent(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    saveEdit(comment.id);
                  }
                }}
                rows={1}
                className="flex-1 min-w-0 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red resize-none overflow-hidden max-h-40"
                autoFocus
                maxLength={limits.postLength}
              />
              <button
                onClick={() => saveEdit(comment.id)}
                disabled={!editContent.trim() || editing}
                className="flex-shrink-0 text-green-600 hover:text-green-700 p-1 disabled:opacity-50"
                title="Save"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={cancelEdit}
                className="flex-shrink-0 text-gray-400 hover:text-gray-600 p-1"
                title="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-800 dark:text-gray-200 mt-0.5">
              {comment.content}
            </p>
          )}

          {!isEditing && (
            <div className="flex items-center gap-4 mt-1">
              <button
                onClick={() => {
                  setReplyingTo(replyingTo === comment.id ? null : comment.id);
                  setReplyContent("");
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
                title="Repost"
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
                title="Like"
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
                title="Bookmark"
              >
                <Bookmark className={`w-3.5 h-3.5 ${comment.bookmarked ? "fill-zrp-red" : ""}`} />
              </button>
            </div>
          )}

          {isReplying && (
            <div className="mt-2 flex items-end gap-2">
              <textarea
                value={replyContent}
                onChange={(e) => {
                  setReplyContent(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                placeholder={`Reply to ${comment.author.name || comment.author.username}...`}
                rows={1}
                className="flex-1 min-w-0 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-2xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-zrp-red focus:border-transparent resize-none overflow-hidden max-h-40"
                maxLength={limits.postLength}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleReply(comment.id);
                  }
                }}
              />
              <button
                onClick={() => handleReply(comment.id)}
                disabled={!replyContent.trim()}
                className="flex-shrink-0 whitespace-nowrap px-3 py-1.5 bg-zrp-red text-white rounded-full text-sm font-medium hover:bg-zrp-darkRed disabled:opacity-50 transition"
              >
                Reply
              </button>
              <button
                onClick={() => {
                  setReplyingTo(null);
                  setReplyContent("");
                }}
                className="flex-shrink-0 whitespace-nowrap text-gray-400 hover:text-gray-600 text-sm"
              >
                Cancel
              </button>
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
        <p className="text-sm text-gray-400 dark:text-gray-500">No comments yet.</p>
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
                {loadingMore ? "Loading..." : "Show more comments"}
              </button>
            </div>
          )}
        </div>
      )}

      {session && !replyingTo && (
        <form onSubmit={handleSubmit} className="mt-3 flex gap-2 items-end">
          <textarea
            value={newComment}
            onChange={(e) => {
              setNewComment(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Write a comment..."
            rows={1}
            className="flex-1 min-w-0 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none overflow-hidden max-h-40"
            maxLength={limits.postLength}
          />
          <button
            type="submit"
            disabled={!newComment.trim() || submitting}
            className="flex-shrink-0 whitespace-nowrap bg-zrp-red text-white px-4 py-1.5 rounded-full text-sm font-medium hover:bg-zrp-darkRed disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-1"
          >
            <Send className="w-4 h-4" />
            Reply
          </button>
        </form>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-sm w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              Delete Comment?
            </h2>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">
              This action cannot be undone. Are you sure you want to delete this comment?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setCommentToDelete(null);
                }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-full text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="bg-red-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-red-700 transition"
              >
                Delete
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
    </div>
  );
}
