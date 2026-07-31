"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import VerifiedBadge from "./VerifiedBadge";

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !session) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newComment }),
      });

      if (res.ok) {
        setNewComment("");
        await fetchComments();
        onCommentAdded();
      }
    } catch (error) {
      console.error("Error posting comment:", error);
    } finally {
      setSubmitting(false);
    }
  };

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

  return (
    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
      {loading ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">Loading comments...</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">No comments yet.</p>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <div key={comment.id} className="flex gap-3">
              {/* ─── Avatar ─── */}
              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 text-sm font-semibold flex-shrink-0 overflow-hidden">
                {comment.author.avatarUrl ? (
                  <img
                    src={comment.author.avatarUrl}
                    alt={comment.author.name || comment.author.username}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  comment.author.name?.[0]?.toUpperCase() || comment.author.username?.[0]?.toUpperCase() || "?"
                )}
              </div>
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium text-sm text-gray-900 dark:text-white">
                    {comment.author.name || comment.author.username}
                  </span>
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
                </div>
                <p className="text-sm text-gray-800 dark:text-gray-200 mt-0.5">
                  {comment.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {session && (
        <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Write a comment..."
            className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            maxLength={280}
          />
          <button
            type="submit"
            disabled={!newComment.trim() || submitting}
            className="bg-zrp-red text-white px-4 py-1.5 rounded-full text-sm font-medium hover:bg-zrp-darkRed disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {submitting ? "..." : "Reply"}
          </button>
        </form>
      )}
    </div>
  );
}
