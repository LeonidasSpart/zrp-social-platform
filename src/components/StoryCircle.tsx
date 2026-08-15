"use client";

import { useRef } from "react";
import Link from "next/link";

interface Props {
  user: { id: string; username: string; name: string; avatarUrl?: string | null };
  hasUnseen: boolean;
  onClick: () => void;
  storyPreview?: string | null;
  storyPreviewType?: string | null; // "image" | "video"
}

export default function StoryCircle({ user, hasUnseen, onClick, storyPreview, storyPreviewType }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const nudged = useRef(false);

  // Same fix already applied to post videos: preload="metadata" alone
  // often leaves the <video> element solid black until playback starts,
  // since it only fetches duration/dimensions, not a decoded frame.
  // Nudging the playhead forward slightly forces the browser to decode
  // and paint a real frame for the thumbnail.
  const nudgeFrame = (el: HTMLVideoElement) => {
    if (nudged.current) return;
    nudged.current = true;
    try {
      el.currentTime = Math.min(0.1, (el.duration || 1) * 0.05);
    } catch {
      // no-op
    }
  };

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 flex-shrink-0"
    >
      <div className={`w-16 h-16 rounded-full p-[2px] ${hasUnseen ? "bg-gradient-to-tr from-yellow-400 to-pink-500" : "bg-gray-300 dark:bg-gray-600"}`}>
        <div className="w-full h-full rounded-full bg-white dark:bg-gray-800 overflow-hidden">
          {storyPreview && storyPreviewType === "video" ? (
            <video
              ref={videoRef}
              src={storyPreview}
              className="w-full h-full object-cover pointer-events-none"
              muted
              playsInline
              webkit-playsinline="true"
              preload="metadata"
              onLoadedMetadata={(e) => nudgeFrame(e.currentTarget)}
              onLoadedData={(e) => nudgeFrame(e.currentTarget)}
            />
          ) : storyPreview ? (
            <img
              src={storyPreview}
              alt={user.name || user.username}
              className="w-full h-full object-cover"
            />
          ) : user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.name || user.username}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-500 text-xl font-bold">
              {user.name?.[0] || user.username[0]}
            </div>
          )}
        </div>
      </div>
      <span className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-[64px]">
        {user.name || user.username}
      </span>
    </button>
  );
}
