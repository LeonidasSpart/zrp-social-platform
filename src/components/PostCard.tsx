"use client";

import { useState } from "react";
import Link from "next/link";
import { Heart, MessageCircle, Repeat, Share2 } from "lucide-react";
import Comments from "./Comments"; // ← Import Comments component

interface PostCardProps {
  post: {
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
    _count: {
      likes: number;
      comments: number;
      reposts: number;
    };
    liked?: boolean;
  };
  onUpdate: () => void;
}

export default function PostCard({ post, onUpdate }: PostCardProps) {
  const [liked, setLiked] = useState(post.liked || false);
  const [likesCount, setLikesCount] = useState(post._count.likes);
  
  // ─── NEW STATE ────────────────────────────────────────────────
  const [showComments, setShowComments] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [repostsCount, setRepostsCount] = useState(post._count.reposts);

  // ─── LIKE HANDLER ──────────────────────────────────────────────
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

  // ─── REPOST HANDLER ────────────────────────────────────────────
  const handleRepost = async () => {
    try {
      const res = await fetch(`/api/posts/${post.id}/repost`, {
        method: "POST",
      });

      if (res.ok) {
        const data = await res.json();
        setReposted(data.reposted);
        setRepostsCount(data.reposted ? repostsCount + 1 : repostsCount - 1);
        onUpdate(); // Refresh parent feed
      }
    } catch (error) {
      console.error("Error reposting:", error);
    }
  };

  // ─── SHARE HANDLER ─────────────────────────────────────────────
  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Post by ${post.author.name}`,
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

  // ─── TIME AGO ──────────────────────────────────────────────────
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
    <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200 hover:bg-gray-50 transition">
      <div className="flex items-start gap-3">
        <Link href={`/profile/${post.author.username}`}>
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold flex-shrink-0">
            {post.author.name?.[0] || "?"}
          </div>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link href={`/profile/${post.author.username}`}>
              <span className="font-semibold hover:underline text-gray-900">
                {post.author.name}
              </span>
            </Link>
            <Link href={`/profile/${post.author.username}`}>
              <span className="text-gray-500 text-sm hover:underline">
                @{post.author.username}
              </span>
            </Link>
            <span className="text-gray-400 text-sm">·</span>
            <span className="text-gray-400 text-sm">{timeAgo(post.createdAt)}</span>
          </div>
          <p className="text-gray-800 mt-1 whitespace-pre-wrap">{post.content}</p>
          {post.imageUrl && (
            <div className="mt-2 rounded-lg overflow-hidden">
              <img src={post.imageUrl} alt="Post image" className="w-full" />
            </div>
          )}

          {/* ─── ACTION BUTTONS ─── */}
          <div className="flex items-center gap-6 mt-3">
            {/* Like */}
            <button
              onClick={handleLike}
              className={`flex items-center gap-1 text-sm ${
                liked ? "text-red-500" : "text-gray-500 hover:text-red-500"
              } transition`}
            >
              <Heart className={`w-4 h-4 ${liked ? "fill-red-500" : ""}`} />
              <span>{likesCount}</span>
            </button>

            {/* Comments - toggles comments section */}
            <button
              onClick={() => setShowComments(!showComments)}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-500 transition"
            >
              <MessageCircle className="w-4 h-4" />
              <span>{post._count.comments}</span>
            </button>

            {/* Repost - toggles repost state */}
            <button
              onClick={handleRepost}
              className={`flex items-center gap-1 text-sm ${
                reposted ? "text-green-500" : "text-gray-500 hover:text-green-500"
              } transition`}
            >
              <Repeat className={`w-4 h-4 ${reposted ? "fill-green-500" : ""}`} />
              <span>{repostsCount}</span>
            </button>

            {/* Share */}
            <button
              onClick={handleShare}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-500 transition"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>

          {/* ─── COMMENTS SECTION ─── */}
          {showComments && (
            <Comments postId={post.id} onCommentAdded={onUpdate} />
          )}
        </div>
      </div>
    </div>
  );
}
