"use client";

import { useState } from "react";
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
} from "lucide-react";
import { useSession } from "next-auth/react";

interface Comment {
  id: string;
  content: string;
  imageUrl?: string;
  createdAt: string;
  author: {
    id: string;
    username: string;
    name: string;
    avatarUrl?: string;
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
  const [liked, setLiked] = useState(comment.liked || false);
  const [likesCount, setLikesCount] = useState(comment._count?.likes || 0);
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

  // ─── EDIT STATE ──────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [savingEdit, setSavingEdit] = useState(false);

  const isAuthor = session?.user?.id === comment.author.id;

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
    } catch (error) {
      console.error(error);
    } finally {
      setLoading({ ...loading, like: false });
    }
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
    } catch (error) {
      console.error(error);
    } finally {
      setLoading({ ...loading, repost: false });
    }
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
    } catch (error) {
      console.error(error);
    } finally {
      setLoading({ ...loading, bookmark: false });
    }
  };

  const handleShare = () => {
    const url = `${window.location.origin}/post/${comment.postId}?comment=${comment.id}`;
    if (navigator.share) {
      navigator.share({ title: "Comment on ZRP", text: comment.content, url });
    } else {
      navigator.clipboard.writeText(url).then(() => alert("Link copied!"));
    }
  };

  // ─── EDIT ──────────────────────────────────────────────────────────
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
        alert("Failed to edit comment");
      }
    } catch (error) {
      console.error(error);
      alert("Failed to edit comment");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this comment?")) return;
    setLoading({ ...loading, delete: true });
    try {
      const res = await fetch(`/api/comments/${comment.id}`, { method: "DELETE" });
      if (res.ok) {
        onUpdate();
      } else {
        alert("Failed to delete comment");
      }
    } catch (error) {
      console.error(error);
      alert("Failed to delete comment");
    } finally {
      setLoading({ ...loading, delete: false });
    }
  };

  return (
    <div className="relative">
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
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold text-sm">
                {(comment.author.name || comment.author.username)[0].toUpperCase()}
              </div>
            )}
          </div>
        </Link>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/profile/${comment.author.username}`}
              className="font-semibold hover:underline text-gray-900 dark:text-white text-sm"
            >
              {comment.author.name || comment.author.username}
            </Link>
            <span className="text-xs text-gray-500">@{comment.author.username}</span>
            <span className="text-xs text-gray-400">·</span>
            <span className="text-xs text-gray-400">
              {new Date(comment.createdAt).toLocaleDateString()}
            </span>
          </div>

          {/* Content */}
          {isEditing ? (
            <div className="mt-1 flex items-start gap-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                rows={2}
                autoFocus
              />
              <button
                onClick={handleEdit}
                disabled={savingEdit || !editContent.trim()}
                className="p-1 text-green-500 hover:text-green-600 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditContent(comment.content);
                }}
                className="p-1 text-gray-500 hover:text-gray-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <p className="mt-0.5 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
                {comment.content}
              </p>
              {comment.imageUrl && (
                <div className="mt-2 rounded-lg overflow-hidden max-h-40">
                  <img
                    src={comment.imageUrl}
                    alt="Comment image"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </>
          )}

          {/* Action buttons – X style */}
          <div className="flex items-center gap-4 mt-1.5 flex-wrap">
            <button
              onClick={handleLike}
              disabled={loading.like}
              className={`flex items-center gap-1 text-xs transition ${
                liked ? "text-red-500" : "text-gray-500 hover:text-red-500"
              }`}
            >
              <Heart className={`w-3.5 h-3.5 ${liked ? "fill-red-500" : ""}`} />
              {likesCount > 0 && <span className="font-medium">{likesCount}</span>}
            </button>
            <button
              onClick={() => onReply(comment.id)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-zrp-red transition"
            >
              <MessageCircle className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleRepost}
              disabled={loading.repost}
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
              className={`flex items-center gap-1 text-xs transition ${
                bookmarked ? "text-blue-500" : "text-gray-500 hover:text-blue-500"
              }`}
            >
              <Bookmark className={`w-3.5 h-3.5 ${bookmarked ? "fill-blue-500" : ""}`} />
              {bookmarksCount > 0 && <span className="font-medium">{bookmarksCount}</span>}
            </button>
            <button
              onClick={handleShare}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition"
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>

            {/* Edit / Delete (own comments) */}
            {isAuthor && !isEditing && (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-gray-400 hover:text-gray-600 transition"
                  title="Edit"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleDelete}
                  disabled={loading.delete}
                  className="text-gray-400 hover:text-red-500 transition"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ─── Nested replies ────────────────────────────────────────── */}
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
    </div>
  );
}
