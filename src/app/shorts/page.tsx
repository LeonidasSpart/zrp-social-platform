"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, Heart, MessageCircle, Repeat, Share2, Volume2, VolumeX, Loader2, Plus } from "lucide-react";
import VerifiedBadge from "@/components/VerifiedBadge";
import ShortUploadModal from "@/components/ShortUploadModal";

interface ShortPost {
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
  reposted?: boolean;
}

function formatCount(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toString();
}

// ─── ZRP Shorts: a dedicated vertical-swipe video feed, TikTok/Reels
// style. Backed by the same /api/videos endpoint the existing tap-to-open
// VideoFeedViewer uses (mediaType: "video" posts), so both every existing
// video post AND anything uploaded through the dedicated "Post a Short"
// button here show up automatically - no separate content pool to manage.
export default function ShortsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [videos, setVideos] = useState<ShortPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [muted, setMuted] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [showUpload, setShowUpload] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const hasFetchedInitial = useRef(false);

  // ─── Double-tap-to-like on the video itself (users expect this - the
  // heart button worked, but there was no tap gesture on the video at
  // all, unlike Stories which already has this). lastTapRef distinguishes
  // a double-tap from the existing single-tap play/pause toggle.
  const lastTapRef = useRef<number>(0);
  const [burstId, setBurstId] = useState<string | null>(null);
  const [burstKey, setBurstKey] = useState(0);

  // ─── Touch-swipe navigation, as a deterministic supplement to the CSS
  // scroll-snap below. Native snap-mandatory can be directionally
  // inconsistent on some mobile browsers - a quick upward flick
  // sometimes doesn't carry enough scroll distance to pass the snap
  // point and gets pulled back to where it started, while downward
  // swipes (often slightly longer/faster in practice) succeed more
  // reliably. Explicitly measuring the swipe and calling scrollToIndex
  // (the same helper already used for desktop arrow keys) makes both
  // directions equally deterministic instead of depending on browser
  // snap physics.
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  // ─── Initial load ───────────────────────────────────────────────────
  useEffect(() => {
    if (hasFetchedInitial.current || status !== "authenticated") return;
    hasFetchedInitial.current = true;

    const load = async () => {
      try {
        const res = await fetch(`/api/videos?limit=8`);
        if (res.ok) {
          const data = await res.json();
          setVideos(data.posts || []);
          setNextCursor(data.nextCursor || null);
        }
      } catch (error) {
        console.error("Error loading Shorts:", error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [status]);

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
      console.error("Error loading more Shorts:", error);
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
        el.play().catch(() => {});
      } else {
        el.pause();
      }
    });
  }, [activeIndex, videos]);

  // ─── Keyboard navigation (desktop) ──────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
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
      console.error("Error liking Short:", error);
    }
  };

  // ─── Repost - the button previously rendered as a plain <div> with no
  // onClick at all, so it showed a count but did nothing when tapped.
  // Matches PostCard's handleRepost exactly (same endpoint, same
  // optimistic pattern), just adapted to this component's array-of-videos
  // state shape instead of single-post state. ───────────────────────────
  const handleRepost = async (postId: string) => {
    if (!session) return;
    try {
      const res = await fetch(`/api/posts/${postId}/repost`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setVideos((prev) =>
          prev.map((v) =>
            v.id === postId
              ? {
                  ...v,
                  reposted: data.reposted,
                  _count: {
                    ...v._count,
                    reposts: data.reposted ? v._count.reposts + 1 : v._count.reposts - 1,
                  },
                }
              : v
          )
        );
      }
    } catch (error) {
      console.error("Error reposting Short:", error);
    }
  };

  const handleShare = async (post: ShortPost) => {
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

  // ─── A freshly-posted Short appears immediately at the top ─────────
  const handleUploaded = (post: ShortPost) => {
    setVideos((prev) => [{ ...post, liked: false }, ...prev]);
    setShowUpload(false);
    setActiveIndex(0);
    requestAnimationFrame(() => {
      containerRef.current?.scrollTo({ top: 0 });
    });
  };

  if (status === "loading" || loading) {
    return (
      <div className="fixed inset-0 bg-black z-[100] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-[100]">
      <button
        onClick={() => router.push("/")}
        className="absolute top-4 left-4 z-10 text-white bg-black/40 rounded-full p-2 hover:bg-black/60 transition"
      >
        <ArrowLeft className="w-6 h-6" />
      </button>

      <h1 className="absolute top-4 left-1/2 -translate-x-1/2 z-10 text-white font-semibold text-lg">
        Shorts
      </h1>

      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <button
          onClick={() => setShowUpload(true)}
          className="text-white bg-black/40 rounded-full p-2 hover:bg-black/60 transition"
          title="Post a Short"
        >
          <Plus className="w-6 h-6" />
        </button>
        {videos.length > 0 && (
          <button
            onClick={() => setMuted((m) => !m)}
            className="text-white bg-black/40 rounded-full p-2 hover:bg-black/60 transition"
          >
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        )}
      </div>

      {videos.length === 0 ? (
        <div className="h-full w-full flex flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-white">No Shorts yet. Be the first to post one.</p>
          <button
            onClick={() => setShowUpload(true)}
            className="text-white bg-zrp-red rounded-full px-4 py-2 hover:bg-zrp-darkRed transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Post a Short
          </button>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="h-full w-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
          style={{ scrollbarWidth: "none" }}
          onTouchStart={(e) => {
            touchStartY.current = e.touches[0].clientY;
          }}
          onTouchEnd={(e) => {
            if (touchStartY.current === null) return;
            const deltaY = touchStartY.current - e.changedTouches[0].clientY;
            touchStartY.current = null;
            // Threshold avoids hijacking small taps/scrolls that native
            // snap-scroll already handles fine on its own - this only
            // steps in for deliberate swipes, which is exactly the
            // gesture that was landing inconsistently before.
            if (Math.abs(deltaY) > 50) {
              scrollToIndex(activeIndex + (deltaY > 0 ? 1 : -1));
            }
          }}
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
                  const now = Date.now();
                  const isDoubleTap = now - lastTapRef.current < 300;
                  lastTapRef.current = now;

                  if (isDoubleTap) {
                    // Double-tap always likes, never unlikes - matches
                    // the same TikTok/Instagram convention already used
                    // for Stories, so repeated double-taps don't toggle
                    // the like back off.
                    if (!post.liked) handleLike(post.id);
                    setBurstId(post.id);
                    setBurstKey((k) => k + 1);
                    window.setTimeout(() => setBurstId((id) => (id === post.id ? null : id)), 700);
                    return;
                  }

                  const el = e.currentTarget;
                  if (el.paused) el.play();
                  else el.pause();
                }}
              />

              {burstId === post.id && (
                <div
                  key={burstKey}
                  className="shorts-heart-burst absolute inset-0 flex items-center justify-center pointer-events-none"
                >
                  <Heart className="w-24 h-24 text-white fill-red-500 drop-shadow-lg" />
                </div>
              )}

              <div className="absolute inset-x-0 bottom-0 p-4 pb-8 bg-gradient-to-t from-black/70 via-black/20 to-transparent">
                <div className="flex items-end justify-between gap-4">
                  <div className="flex-1 min-w-0 text-white">
                    <Link
                      href={`/profile/${post.author.username}`}
                      className="flex items-center gap-2 mb-2"
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

                  <div className="flex flex-col items-center gap-4 flex-shrink-0 text-white">
                    <button
                      onClick={() => handleLike(post.id)}
                      className="flex flex-col items-center gap-1"
                    >
                      <Heart className={`w-7 h-7 ${post.liked ? "fill-red-500 text-red-500" : ""}`} />
                      <span className="text-xs">{formatCount(post._count.likes)}</span>
                    </button>
                    <Link href={`/post/${post.id}`} className="flex flex-col items-center gap-1">
                      <MessageCircle className="w-7 h-7" />
                      <span className="text-xs">{formatCount(post._count.comments)}</span>
                    </Link>
                    <button
                      onClick={() => handleRepost(post.id)}
                      className="flex flex-col items-center gap-1"
                    >
                      <Repeat className={`w-7 h-7 ${post.reposted ? "text-green-500" : ""}`} />
                      <span className="text-xs">{formatCount(post._count.reposts)}</span>
                    </button>
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
      )}

      {showUpload && (
        <ShortUploadModal onClose={() => setShowUpload(false)} onUploaded={handleUploaded} />
      )}

      <style jsx>{`
        .shorts-heart-burst {
          animation: heartBurst 0.7s ease-out forwards;
          z-index: 5;
        }
        @keyframes heartBurst {
          0% {
            opacity: 0;
            transform: scale(0.4);
          }
          25% {
            opacity: 1;
            transform: scale(1.15);
          }
          40% {
            transform: scale(1);
          }
          100% {
            opacity: 0;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
}
