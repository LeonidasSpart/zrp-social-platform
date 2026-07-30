"use client";

import { useState, useEffect } from "react";
import VerifiedBadge from "./VerifiedBadge";

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  author: {
    id: string;
    username: string;
    name: string;
    avatarUrl?: string;
    badgeType?: string | null;
  };
}

interface CommentsProps {
  postId: string;
  onCommentAdded: () => void;
}

export default function Comments({ postId, onCommentAdded }: CommentsProps) {
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
    if (!newComment.trim()) return;

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
    <div className="mt-3 pt-3 border-t border-gray-100">
      {loading ? (
        <p className="text-sm text-gray-400">Loading comments...</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-gray-400">No comments yet.</p>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <div key={comment.id} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-sm font-semibold flex-shrink-0">
                {comment.author.name?.[0] || "?"}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm inline-flex items-center gap-1">
                    {comment.author.name}
                    <VerifiedBadge badgeType={comment.author.badgeType} />
                  </span>
                  <span className="text-xs text-gray-400">@{comment.author.username}</span>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-xs text-gray-400">{timeAgo(comment.createdAt)}</span>
                </div>
                <p className="text-sm text-gray-800">{comment.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <input
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Write a comment..."
          className="flex-1 px-3 py-1.5 border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          maxLength={280}
        />
        <button
          type="submit"
          disabled={!newComment.trim() || submitting}
          className="bg-blue-600 text-white px-4 py-1.5 rounded-full text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "..." : "Reply"}
        </button>
      </form>
    </div>
  );
}
