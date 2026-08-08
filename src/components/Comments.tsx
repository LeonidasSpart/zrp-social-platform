"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Send, Pencil, Trash2, X, Check, Reply } from "lucide-react";
import VerifiedBadge from "./VerifiedBadge";
import { timeAgo } from "@/lib/utils";

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
}

interface CommentsProps {
  postId: string;
  onCommentAdded: () => void;
}

export default function Comments({ postId, onCommentAdded }: CommentsProps) {
  const { data: session } = useSession();
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

  const fetchComments = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data);
      }
    } catch (error) {
      console.error("Error fetching comments:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();
  }, [postId]);

  // ─── Add top‑level comment ──────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); // ✅ Prevents page refresh
    if (!newComment.trim() || !session) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newComment.trim() }),
      });

      if (res.ok) {
        setNewComment("");
        await fetchComments();
        onCommentAdded(); // Only updates state, never reloads
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
        setReplyContent("");
        setReplyingTo(null);
        await fetchComments();
        onCommentAdded();
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
        setEditingId(null);
        setEditContent("");
        await fetchComments();
        onCommentAdded();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to update comment");
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

  const handleDelete = async () => {
    if (!commentToDelete) return;

    try {
      const res = await fetch(`/api/comments/${commentToDelete}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setShowDeleteModal(false);
        setCommentToDelete(null);
        await fetchComments();
        onCommentAdded();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to delete comment");
      }
    } catch (error) {
      console.error("Error deleting comment:", error);
      alert("Failed to delete comment");
    }
  };

  const getAvatarSrc = (author: Comment["author"]) => {
    return author.avatarUrl || "/default-avatar.png";
  };

  const getDisplayName = (author: Comment["author"]) => {
    return author.name || author.username;
  };

  // ─── Render a single comment (recursive) ──────────────────────────
  const renderComment = (comment: Comment, depth = 0) => {
    const isAuthor = session?.user?.id === comment.author.id;
    const isEditing = editingId === comment.id;
    const isReplying = replyingTo === comment.id;

    return (
      <div
        key={comment.id}
        className={`flex gap-3 group ${depth > 0 ? "ml-8 pl-4 border-l-2 border-gray-200 dark:border-gray-700" : ""}`}
      >
        {/* Avatar */}
        <Link
          href={`/profile/${comment.author.username}`}
          className="flex-shrink-0"
        >
          <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 text-sm font-semibold overflow-hidden hover:ring-2 hover:ring-zrp-red transition">
            <img
              src={getAvatarSrc(comment.author)}
              alt={getDisplayName(comment.author)}
              className="w-full h-full object-cover"
            />
          </div>
        </Link>

        <div className="flex-1 min-w-0">
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
          </div>

          {isEditing ? (
            <div className="mt-1 flex items-center gap-2">
              <input
                type="text"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="flex-1 min-w-0 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red"
                autoFocus
                maxLength={280}
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
            <button
              onClick={() => {
                setReplyingTo(replyingTo === comment.id ? null : comment.id);
                setReplyContent("");
              }}
              className="text-xs text-gray-400 hover:text-zrp-red transition mt-0.5 flex items-center gap-1 whitespace-nowrap"
            >
              <Reply className="w-3 h-3" />
              Reply
            </button>
          )}

          {isReplying && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder={`Reply to ${comment.author.name || comment.author.username}...`}
                className="flex-1 min-w-0 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-zrp-red focus:border-transparent"
                maxLength={280}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
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

          {comment.replies && comment.replies.length > 0 && (
            <div className="mt-2 space-y-2">
              {comment.replies.map((reply) => renderComment(reply, depth + 1))}
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
        <div className="space-y-3">
          {comments.map((comment) => renderComment(comment, 0))}
        </div>
      )}

      {session && (
        <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Write a comment..."
            className="flex-1 min-w-0 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            maxLength={280}
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
    </div>
  );
}
