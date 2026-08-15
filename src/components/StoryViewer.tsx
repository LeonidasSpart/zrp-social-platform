"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Eye, Heart } from "lucide-react";

interface Props {
  group: {
    user: { id: string; username: string; name: string; avatarUrl?: string };
    stories: Array<{
      id: string;
      content?: string;
      mediaUrl?: string;
      mediaType?: string;
      viewed: boolean;
      viewCount?: number;   // ✅ now we receive it
      liked?: boolean;
      likeCount?: number;
    }>;
  };
  onClose: () => void;
  onStoryViewed: () => void;
}

export default function StoryViewer({ group, onClose, onStoryViewed }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [burstKey, setBurstKey] = useState(0); // remounts the heart-burst animation each tap
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Liked/likeCount are tracked per-story locally so switching between
  // stories in the group shows each one's own state correctly, and so
  // a like updates instantly without waiting on a refetch.
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(group.stories.map((s) => [s.id, !!s.liked]))
  );
  const [likeCountMap, setLikeCountMap] = useState<Record<string, number>>(() =>
    Object.fromEntries(group.stories.map((s) => [s.id, s.likeCount ?? 0]))
  );

  const story = group.stories[currentIndex];
  const liked = likedMap[story.id] ?? false;
  const likeCount = likeCountMap[story.id] ?? 0;

  useEffect(() => {
    if (!story.viewed) {
      fetch(`/api/stories/${story.id}/view`, { method: "POST" });
      onStoryViewed();
    }
  }, [story.id]);

  useEffect(() => {
    setProgress(0);
    if (timerRef.current) clearInterval(timerRef.current);
    if (paused) return;
    const start = Date.now() - (progress / 100) * 5000;
    const duration = 5000;
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, (elapsed / duration) * 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(interval);
        if (currentIndex < group.stories.length - 1) {
          setCurrentIndex(currentIndex + 1);
        } else {
          onClose();
        }
      }
    }, 100);
    timerRef.current = interval;
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, group.stories.length, onClose, paused]);

  const next = () => {
    if (currentIndex < group.stories.length - 1) setCurrentIndex(currentIndex + 1);
    else onClose();
  };

  const prev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  const toggleLike = useCallback(
    async (storyId: string, showBurstOnlyWhenLiking: boolean) => {
      const wasLiked = likedMap[storyId] ?? false;
      const nextLiked = !wasLiked;

      // Optimistic update - same pattern as post/comment likes.
      setLikedMap((prev) => ({ ...prev, [storyId]: nextLiked }));
      setLikeCountMap((prev) => ({
        ...prev,
        [storyId]: Math.max(0, (prev[storyId] ?? 0) + (nextLiked ? 1 : -1)),
      }));

      if (nextLiked && showBurstOnlyWhenLiking) {
        setBurstKey((k) => k + 1);
      }

      try {
        const res = await fetch(`/api/stories/${storyId}/like`, { method: "POST" });
        if (!res.ok) throw new Error("Failed to update like");
        const data = await res.json();
        // Reconcile with the server's actual result in case of a race
        // (e.g. rapid double-tap) rather than trusting the optimistic
        // guess indefinitely.
        setLikedMap((prev) => ({ ...prev, [storyId]: data.liked }));
      } catch {
        // Revert on failure
        setLikedMap((prev) => ({ ...prev, [storyId]: wasLiked }));
        setLikeCountMap((prev) => ({
          ...prev,
          [storyId]: Math.max(0, (prev[storyId] ?? 0) + (wasLiked ? 1 : -1)),
        }));
      }
    },
    [likedMap]
  );

  // Double-tap-to-like on the middle third of the screen - the left and
  // right thirds are already prev/next navigation zones, so the middle
  // third is free for this without any conflict.
  const lastTapRef = useRef<number>(0);
  const handleCenterTap = () => {
    const now = Date.now();
    const isDoubleTap = now - lastTapRef.current < 300;
    lastTapRef.current = now;
    if (isDoubleTap) {
      // Double-tap always likes (never unlikes) - matches TikTok/Instagram
      // convention, so repeated double-taps don't accidentally toggle
      // the like back off.
      if (!(likedMap[story.id] ?? false)) {
        toggleLike(story.id, true);
      } else {
        setBurstKey((k) => k + 1); // still show the burst for feedback
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white hover:text-gray-300 z-10"
      >
        <X className="w-8 h-8" />
      </button>

      <div className="relative w-full max-w-md h-[80vh] bg-gray-900 rounded-lg overflow-hidden">
        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 flex gap-1 p-2 z-10">
          {group.stories.map((_, idx) => (
            <div
              key={idx}
              className="h-1 flex-1 bg-gray-600 rounded-full overflow-hidden"
            >
              <div
                className="h-full bg-white transition-all"
                style={{
                  width: idx === currentIndex ? `${progress}%` : idx < currentIndex ? "100%" : "0%",
                }}
              />
            </div>
          ))}
        </div>

        {/* Story content */}
        <div className="relative w-full h-full flex items-center justify-center">
          {story.mediaUrl ? (
            <>
              {story.mediaType === "video" ? (
                <video src={story.mediaUrl} className="max-h-full max-w-full" controls autoPlay />
              ) : (
                <img
                  src={story.mediaUrl}
                  alt="Story"
                  className="max-h-full max-w-full object-contain"
                />
              )}
              {/* Text overlay – bottom aligned */}
              {story.content && (
                <div className="absolute bottom-12 left-0 right-0 text-center text-white p-4 bg-gradient-to-t from-black/70 to-transparent">
                  <p className="text-sm font-light tracking-wide drop-shadow-md">
                    {story.content}
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="text-white text-center p-6">
              <p className="text-xl font-medium">{story.content || "No content"}</p>
            </div>
          )}

          {/* Heart-burst animation on double-tap-to-like */}
          <div
            key={burstKey}
            className={burstKey > 0 ? "story-heart-burst" : "hidden"}
            aria-hidden="true"
          >
            <Heart className="w-24 h-24 text-white fill-zrp-red text-zrp-red drop-shadow-lg" />
          </div>
        </div>

        {/* User info */}
        <div className="absolute top-12 left-4 flex items-center gap-2 text-white z-10">
          <div className="w-8 h-8 rounded-full bg-gray-500 overflow-hidden">
            {group.user.avatarUrl ? (
              <img
                src={group.user.avatarUrl}
                alt={group.user.name || group.user.username}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm font-bold">
                {group.user.name?.[0] || group.user.username[0]}
              </div>
            )}
          </div>
          <span className="font-medium text-sm">{group.user.name || group.user.username}</span>
        </div>

        {/* View count – top right */}
        <div className="absolute top-12 right-4 flex items-center gap-1 text-white/70 text-xs z-10 bg-black/30 px-2 py-1 rounded-full">
          <Eye className="w-3 h-3" />
          <span>{story.viewCount ?? 0}</span>
        </div>

        {/* Like button – bottom right, TikTok-style vertical action rail */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleLike(story.id, false);
          }}
          className="absolute bottom-6 right-4 z-20 flex flex-col items-center gap-1 text-white"
          aria-pressed={liked}
          aria-label={liked ? "Unlike story" : "Like story"}
        >
          <Heart
            className={`w-8 h-8 transition-transform active:scale-90 ${
              liked ? "fill-zrp-red text-zrp-red" : "text-white"
            }`}
          />
          <span className="text-xs font-medium drop-shadow-md">{likeCount}</span>
        </button>

        {/* Navigation */}
        <div
          className="absolute left-0 top-0 w-1/3 h-full cursor-pointer z-10"
          onClick={prev}
        />
        <div
          className="absolute left-1/3 top-0 w-1/3 h-full cursor-pointer z-10"
          onMouseDown={() => setPaused(true)}
          onMouseUp={() => setPaused(false)}
          onTouchStart={() => setPaused(true)}
          onTouchEnd={() => setPaused(false)}
          onClick={handleCenterTap}
        />
        <div
          className="absolute right-0 top-0 w-1/3 h-full cursor-pointer z-10"
          onClick={next}
        />
      </div>

      <style jsx>{`
        .story-heart-burst {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          animation: heartBurst 0.7s ease-out forwards;
          pointer-events: none;
          z-index: 15;
        }
        @keyframes heartBurst {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.4);
          }
          25% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1.15);
          }
          40% {
            transform: translate(-50%, -50%) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(1);
          }
        }
      `}</style>
    </div>
  );
}
