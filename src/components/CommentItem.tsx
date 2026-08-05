"use client";

import { useState } from "react";
import Link from "next/link";
import { Heart, MessageCircle } from "lucide-react";
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
  };
  liked?: boolean;
}

interface CommentItemProps {
  comment: Comment;
  onReply: (commentId: string) => void;
  onUpdate: () => void;
}

export default function CommentItem({ comment, onReply, onUpdate }: CommentItemProps) {
  const { data: session } = useSession();
  const [liked, setLiked] = useState(comment.liked || false);
  const [likesCount, setLikesCount] = useState(comment._count?.likes || 0);
  const [isLiking, setIsLiking] = useState(false);

  const handleLike = async () => {
    if (!session || isLiking) return;
    setIsLiking(true);
    try {
      const res = await fetch(`/api/comments/${comment.id}/like`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setLiked(data.liked);
        setLikesCount((prev) => (data.liked ? prev + 1 : prev - 1));
        onUpdate();
      }
    } catch (error) {
      console.error("Error liking comment:", error);
    } finally {
      setIsLiking(false);
    }
  };

  return (
    <div className="rounded-lg">
      {/* ─── Comment card ──────────────────────────────────────────── */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
        <div className="flex items-start gap-3">
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
            <p className="mt-1 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
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

            {/* ─── Action buttons ───────────────────────────────────── */}
            <div className="flex items-center gap-4 mt-2">
              <button
                onClick={handleLike}
                disabled={isLiking}
                className={`flex items-center gap-1 text-xs transition ${
                  liked ? "text-red-500" : "text-gray-500 hover:text-red-500"
                }`}
              >
                <Heart className={`w-3.5 h-3.5 ${liked ? "fill-red-500" : ""}`} />
                {likesCount > 0 && <span>{likesCount}</span>}
              </button>
              <button
                onClick={() => onReply(comment.id)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-zrp-red transition"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Reply
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Nested replies ────────────────────────────────────────── */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="ml-8 mt-2 space-y-2 border-l-2 border-gray-200 dark:border-gray-700 pl-4">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              onReply={onReply}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
