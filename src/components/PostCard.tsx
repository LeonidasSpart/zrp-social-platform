"use client";

import { useState } from "react";
import Link from "next/link";
import { Heart, MessageCircle, Repeat, Share2, Pencil, Trash2, Flag } from "lucide-react";
import { useSession } from "next-auth/react";
import Comments from "./Comments";
import EditPostModal from "./EditPostModal";
import ReportModal from "./ReportModal";

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
    _count?: {
      likes: number;
      comments: number;
      reposts: number;
    };
    liked?: boolean;
  };
  onUpdate: () => void;
}

export default function PostCard({ post, onUpdate }: PostCardProps) {
  const { data: session } = useSession();
  const [liked, setLiked] = useState(post.liked || false);
  const [likesCount, setLikesCount] = useState(post._count?.likes || 0);
  const [showComments, setShowComments] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [repostsCount, setRepostsCount] = useState(post._count?.reposts || 0);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isAuthor = session?.user?.id === post.author.id;

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
    <>
      <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200 hover:bg-gray-50 transition">
        <div className="flex items-start gap-3">
          <Link href={`/profile/${post.author.username}`}>
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold flex-shrink-0">
              {post.author.name?.[0] || post.author.username?.[0] || "?"}
            </div>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link href={`/profile/${post.author.username}`}>
                  <span className="font-semibold hover:underline text-gray-900">
                    {post.author.name || post.author.username}
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

              {/* ─── Edit & Delete Buttons (Author) ─── */}
              {isAuthor ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowEditModal(true)}
                    className="text-gray-400 hover:text-blue-500 transition p-1"
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
                // ─── Report Button (Non-author) ───
                <button
                  onClick={() => setShowReportModal(true)}
                  className="text-gray-400 hover:text-red-500 transition p-1"
                  title="Report"
                >
                  <Flag className="w-4 h-4" />
                </button>
              )}
            </div>

            <p className="text-gray-800 mt-1 whitespace-pre-wrap">{post.content}</p>
            {post.imageUrl && (
              <div className="mt-2 rounded-lg overflow-hidden">
                <img src={post.imageUrl} alt="Post image" className="w-full" />
              </div>
            )}

            <div className="flex items-center gap-6 mt-3">
              <button
                onClick={handleLike}
                className={`flex items-center gap-1 text-sm ${
                  liked ? "text-red-500" : "text-gray-500 hover:text-red-500"
                } transition`}
              >
                <Heart className={`w-4 h-4 ${liked ? "fill-red-500" : ""}`} />
                <span>{likesCount}</span>
              </button>

              <button
                onClick={() => setShowComments(!showComments)}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-500 transition"
              >
                <MessageCircle className="w-4 h-4" />
                <span>{post._count?.comments || 0}</span>
              </button>

              <button
                onClick={handleRepost}
                className={`flex items-center gap-1 text-sm ${
                  reposted ? "text-green-500" : "text-gray-500 hover:text-green-500"
                } transition`}
              >
                <Repeat className={`w-4 h-4 ${reposted ? "fill-green-500" : ""}`} />
                <span>{repostsCount}</span>
              </button>

              <button
                onClick={handleShare}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-500 transition"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </div>

            {showComments && (
              <Comments postId={post.id} onCommentAdded={onUpdate} />
            )}
          </div>
        </div>
      </div>

      {/* ─── Edit Modal ─── */}
      <EditPostModal
        post={post}
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onUpdate={onUpdate}
      />

      {/* ─── Delete Confirmation Modal ─── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Delete Post?</h2>
            <p className="text-gray-600 text-sm mb-6">
              This action cannot be undone. Are you sure you want to delete this post?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 border border-gray-300 rounded-full text-sm font-medium hover:bg-gray-50 transition"
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

      {/* ─── Report Modal ─── */}
      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSubmit={handleReport}
      />
    </>
  );
}
