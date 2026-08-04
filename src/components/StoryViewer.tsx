"use client";

import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";

interface Props {
  group: {
    user: { id: string; username: string; name: string; avatarUrl?: string };
    stories: Array<{
      id: string;
      content?: string;
      mediaUrl?: string;
      mediaType?: string;
      viewed: boolean;
    }>;
  };
  onClose: () => void;
  onStoryViewed: () => void;
}

export default function StoryViewer({ group, onClose, onStoryViewed }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const story = group.stories[currentIndex];

  useEffect(() => {
    if (!story.viewed) {
      fetch(`/api/stories/${story.id}/view`, { method: "POST" });
      onStoryViewed();
    }
  }, [story.id]);

  useEffect(() => {
    setProgress(0);
    if (timerRef.current) clearInterval(timerRef.current);
    const start = Date.now();
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
  }, [currentIndex, group.stories.length, onClose]);

  const next = () => {
    if (currentIndex < group.stories.length - 1) setCurrentIndex(currentIndex + 1);
    else onClose();
  };

  const prev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
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
              {/* Professional text overlay */}
              {story.content && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="max-w-[80%] p-6 bg-black/40 backdrop-blur-sm rounded-2xl border border-white/10 shadow-2xl">
                    <p className="text-white text-2xl font-light text-center leading-relaxed drop-shadow-lg">
                      {story.content}
                    </p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-white text-center p-6">
              <p className="text-xl font-medium">{story.content || "No content"}</p>
            </div>
          )}
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
          <span className="font-medium">{group.user.name || group.user.username}</span>
        </div>

        {/* Navigation */}
        <div
          className="absolute left-0 top-0 w-1/3 h-full cursor-pointer z-10"
          onClick={prev}
        />
        <div
          className="absolute right-0 top-0 w-1/3 h-full cursor-pointer z-10"
          onClick={next}
        />
      </div>
    </div>
  );
}
