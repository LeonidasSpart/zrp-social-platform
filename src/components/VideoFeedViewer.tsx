"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { X, Heart, MessageCircle, Repeat, Share2, Volume2, VolumeX, Loader2 } from "lucide-react";
import VerifiedBadge from "./VerifiedBadge";

interface VideoPost {
  id: string;
  content: string;
  imageUrl: string;
  createdAt: string;
  author: {
    id: string;
    username: string;
    name: string;
    avatarUrl?: string | null;
    badgeType?: string | null;
  };
  _count: { likes: number; comments: number; reposts: number; quotedBy: number };
  liked?: boolean;
}

interface VideoFeedViewerProps {
  startPostId: string;
  onClose: () => void;
}

function formatCount(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toString();
}

export default function VideoFeedViewer({ startPostId, onClose }: VideoFeedViewerProps) {
  const { data: session } = useSession();
  const [videos, setVideos] = useState<VideoPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [muted, setMuted] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const hasFetchedInitial = useRef(false);

  // ─── Initial load: starting video first, then more ────────────────
  useEffect(() => {
    if (hasFetchedInitial.current) return;
    hasFetchedInitial.current = true;

    const load = async () => {
      try {
        const res = await fetch(`/api/videos?startId=${startPostId}&limit=8`);
        if (res.ok) {
          const data = await res.json();
          setVideos(data.posts || []);
          setNextCursor(data.nextCursor || null);
        }
      } catch (error) {
        console.error("Error loading video feed:", error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [startPostId]);

  // ─── Load more as the person approaches the end ────────────────────
  const loadMore = useCallback(async () => {
    if (loadingMore || !nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/videos?cursor=${nextCursor}&limit=8`);
      if (res.ok) {
        const data = await res.json();
        setVideos((prev) => [...prev, ...(data.posts || [])]);
        setNextCursor(data.nextCursor || null);
      }
    } catch (error) {
      console.error("Error loading more videos:", error);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, nextCursor]);

  // ─── Track which video is centered via scroll position ─────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const index = Math.round(container.scrollTop / container.clientHeight);
      setActiveIndex((prev) => (prev !== index ? index : prev));

      // Fetch more once within 2 videos of the end
      if (index >= videos.length - 2 && nextCursor) {
        loadMore();
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [videos.length, nextCursor, loadMore]);

  // ─── Play the active video, pause the rest ─────────────────────────
  useEffect(() => {
    Object.entries(videoRefs.current).forEach(([id, el]) => {
      if (!el) return;
      const post = videos[activeIndex];
      if (post && id === post.id) {
        el.currentTime = el.currentTime; // no-op, keeps position on remount
        el.play().catch(() => {});
      } else {
        el.pause();
      }
    });
  }, [activeIndex, videos]);

  // ─── Lock body scroll while open ────────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // ─── Keyboard navigation (desktop) ──────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") scrollToIndex(activeIndex + 1);
      if (e.key === "ArrowUp") scrollToIndex(activeIndex - 1);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeIndex]);

  const scrollToIndex = (index: number) => {
    const container = containerRef.current;
    if (!container) return;
    const clamped = Math.max(0, Math.min(index, videos.length - 1));
    container.scrollTo({ top: clamped * container.clientHeight, behavior: "smooth" });
  };

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  const handleLike = async (postId: string) => {
    if (!session) return;
    setVideos((prev) =>
      prev.map((v) =>
        v.id === postId
          ? {
              ...v,
              liked: !v.liked,
              _count: { ...v._count, likes: v.liked ? v._count.likes - 1 : v._count.likes + 1 },
            }
          : v
      )
    );
    try {
      await fetch(`/api/posts/${postId}/like`, { method: "POST" });
    } catch (error) {
      console.error("Error liking video:", error);
    }
  };

  const handleShare = async (post: VideoPost) => {
    const url = `${window.location.origin}/post/${post.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Post by ${post.author.name || post.author.username}`, url });
      } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(url);
      } catch {}
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black z-[100] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2 hover:bg-black/70 transition"
        >
          <X className="w-6 h-6" />
        </button>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="fixed inset-0 bg-black z-[100] flex flex-col items-center justify-center gap-4">
        <p className="text-white">This video isn't available anymore.</p>
        <button
          onClick={onClose}
          className="text-white bg-white/10 rounded-full px-4 py-2 hover:bg-white/20 transition"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-[100]">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 text-white bg-black/40 rounded-full p-2 hover:bg-black/60 transition"
      >
        <X className="w-6 h-6" />
      </button>

      <button
        onClick={() => setMuted((m) => !m)}
        className="absolute top-4 left-4 z-10 text-white bg-black/40 rounded-full p-2 hover:bg-black/60 transition"
      >
        {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
      </button>

      <div
        ref={containerRef}
        className="h-full w-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
        style={{ scrollbarWidth: "none" }}
      >
        {videos.map((post, index) => (
          <div
            key={post.id}
            className="relative h-full w-full snap-start snap-always flex items-center justify-center"
          >
            <video
              ref={(el) => {
                videoRefs.current[post.id] = el;
              }}
              src={post.imageUrl}
              className="max-h-full max-w-full object-contain"
              loop
              muted={muted}
              playsInline
              webkit-playsinline="true"
              onClick={(e) => {
                const el = e.currentTarget;
                if (el.paused) el.play();
                else el.pause();
              }}
            />

            {/* ─── Overlay: author + caption + actions, X/TikTok style ─── */}
            <div className="absolute inset-x-0 bottom-0 p-4 pb-8 bg-gradient-to-t from-black/70 via-black/20 to-transparent">
              <div className="flex items-end justify-between gap-4">
                <div className="flex-1 min-w-0 text-white">
                  <Link
                    href={`/profile/${post.author.username}`}
                    className="flex items-center gap-2 mb-2"
                    onClick={onClose}
                  >
                    <div className="w-9 h-9 rounded-full bg-gray-700 overflow-hidden flex-shrink-0">
                      {post.author.avatarUrl ? (
                        <img
                          src={post.author.avatarUrl}
                          alt={post.author.name || post.author.username}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-bold">
                          {(post.author.name || post.author.username)[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                    <span className="font-semibold flex items-center gap-1">
                      {post.author.name || post.author.username}
                      <VerifiedBadge badgeType={post.author.badgeType} />
                    </span>
                    <span className="text-white/70 text-sm">· {timeAgo(post.createdAt)}</span>
                  </Link>
                  {post.content && (
                    <p className="text-sm whitespace-pre-wrap break-words line-clamp-3">
                      {post.content}
                    </p>
                  )}
                </div>

                {/* ─── Right-side action rail ────────────────────────── */}
                <div className="flex flex-col items-center gap-4 flex-shrink-0 text-white">
                  <button
                    onClick={() => handleLike(post.id)}
                    className="flex flex-col items-center gap-1"
                  >
                    <Heart className={`w-7 h-7 ${post.liked ? "fill-red-500 text-red-500" : ""}`} />
                    <span className="text-xs">{formatCount(post._count.likes)}</span>
                  </button>
                  <Link
                    href={`/post/${post.id}`}
                    className="flex flex-col items-center gap-1"
                    onClick={onClose}
                  >
                    <MessageCircle className="w-7 h-7" />
                    <span className="text-xs">{formatCount(post._count.comments)}</span>
                  </Link>
                  <div className="flex flex-col items-center gap-1">
                    <Repeat className="w-7 h-7" />
                    <span className="text-xs">{formatCount(post._count.reposts)}</span>
                  </div>
                  <button
                    onClick={() => handleShare(post)}
                    className="flex flex-col items-center gap-1"
                  >
                    <Share2 className="w-7 h-7" />
                  </button>
                </div>
              </div>
            </div>

            {index === videos.length - 1 && loadingMore && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
