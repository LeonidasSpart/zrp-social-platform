"use client";

import { useState, useTransition } from "react";
import { Heart, MessageCircle, Repeat2, Bookmark, Share2, Pin, PinOff, Quote } from "lucide-react";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";

interface PostActionsProps {
  postId: string;
  userId: string;
  initialLikes: number;
  initialComments: number;
  initialReposts: number;
  isLiked: boolean;
  isReposted: boolean;
  isBookmarked: boolean;
  // ─── Pin props ──────────────────────────────────────────────────────
  isPinned?: boolean;
  isAuthor?: boolean;
  onPinToggle?: () => void;
  // ─── Quote Repost ──────────────────────────────────────────────────
  onQuote?: () => void;
}

export function PostActions({
  postId,
  userId,
  initialLikes,
  initialComments,
  initialReposts,
  isLiked: initialIsLiked,
  isReposted: initialIsReposted,
  isBookmarked: initialIsBookmarked,
  isPinned = false,
  isAuthor = false,
  onPinToggle,
  onQuote,
}: PostActionsProps) {
  const [likes, setLikes] = useState(initialLikes);
  const [reposts, setReposts] = useState(initialReposts);
  const [isLiked, setIsLiked] = useState(initialIsLiked);
  const [isReposted, setIsReposted] = useState(initialIsReposted);
  const [isBookmarked, setIsBookmarked] = useState(initialIsBookmarked);
  const [isPending, startTransition] = useTransition();
  const { data: session } = useSession();

  const handleLike = async () => {
    if (!session) return;
    const newState = !isLiked;
    setIsLiked(newState);
    setLikes((prev) => prev + (newState ? 1 : -1));

    startTransition(async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/like`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, action: newState ? "like" : "unlike" }),
        });
        if (!res.ok) throw new Error("Failed to toggle like");
      } catch {
        setIsLiked(!newState);
        setLikes((prev) => prev + (!newState ? 1 : -1));
      }
    });
  };

  const handleRepost = async () => {
    if (!session) return;
    const newState = !isReposted;
    setIsReposted(newState);
    setReposts((prev) => prev + (newState ? 1 : -1));

    startTransition(async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/repost`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, action: newState ? "repost" : "unrepost" }),
        });
        if (!res.ok) throw new Error("Failed to toggle repost");
      } catch {
        setIsReposted(!newState);
        setReposts((prev) => prev + (!newState ? 1 : -1));
      }
    });
  };

  const handleBookmark = async () => {
    if (!session) return;
    const newState = !isBookmarked;
    setIsBookmarked(newState);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/bookmark`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, action: newState ? "bookmark" : "unbookmark" }),
        });
        if (!res.ok) throw new Error("Failed to toggle bookmark");
      } catch {
        setIsBookmarked(!newState);
      }
    });
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: "ZRP Post",
        text: "Check out this post on ZRP Social!",
        url: `${window.location.origin}/post/${postId}`,
      });
    } else {
      navigator.clipboard.writeText(`${window.location.origin}/post/${postId}`);
      alert("Link copied to clipboard!");
    }
  };

  const handlePinToggle = () => {
    if (onPinToggle) onPinToggle();
  };

  const handleQuote = () => {
    if (onQuote) onQuote();
  };

  return (
    <div className="flex items-center gap-4 mt-2 text-zinc-500">
      <button
        onClick={handleLike}
        disabled={isPending}
        className={cn(
          "flex items-center gap-1 text-sm hover:text-red-500 transition-colors disabled:opacity-50",
          isLiked && "text-red-500"
        )}
      >
        <Heart className={cn("w-5 h-5", isLiked && "fill-current")} />
        <span>{likes > 0 && likes}</span>
      </button>

      <button
        onClick={() => window.location.href = `/post/${postId}`}
        className="flex items-center gap-1 text-sm hover:text-blue-500 transition-colors"
      >
        <MessageCircle className="w-5 h-5" />
        <span>{initialComments > 0 && initialComments}</span>
      </button>

      <button
        onClick={handleRepost}
        disabled={isPending}
        className={cn(
          "flex items-center gap-1 text-sm hover:text-green-500 transition-colors disabled:opacity-50",
          isReposted && "text-green-500"
        )}
      >
        <Repeat2 className={cn("w-5 h-5", isReposted && "fill-current")} />
        <span>{reposts > 0 && reposts}</span>
      </button>

      {/* ─── Quote Repost Button ────────────────────────────────────── */}
      {onQuote && (
        <button
          onClick={handleQuote}
          className="flex items-center gap-1 text-sm hover:text-blue-400 transition-colors"
          title="Quote this post"
        >
          <Quote className="w-5 h-5" />
        </button>
      )}

      <button
        onClick={handleBookmark}
        disabled={isPending}
        className={cn(
          "flex items-center gap-1 text-sm hover:text-zrp-red transition-colors disabled:opacity-50",
          isBookmarked && "text-zrp-red"
        )}
      >
        <Bookmark className={cn("w-5 h-5", isBookmarked && "fill-current")} />
      </button>

      <button
        onClick={handleShare}
        className="flex items-center gap-1 text-sm hover:text-blue-400 transition-colors"
      >
        <Share2 className="w-5 h-5" />
      </button>

      {/* ─── Pin Button (only for author) ────────────────────────────── */}
      {isAuthor && onPinToggle && (
        <button
          onClick={handlePinToggle}
          className={cn(
            "flex items-center gap-1 text-sm transition-colors",
            isPinned
              ? "text-blue-600"
              : "text-zinc-400 hover:text-blue-600"
          )}
          title={isPinned ? "Unpin from profile" : "Pin to profile"}
        >
          {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
        </button>
      )}
    </div>
  );
}
