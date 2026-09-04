"use client";

import { useRef } from "react";
import Link from "next/link";

interface Props {
  user: { id: string; username: string; name: string; avatarUrl?: string | null };
  hasUnseen: boolean;
  onClick: () => void;
  storyPreview?: string | null;
  storyPreviewType?: string | null; // "image" | "video"
  // ZRP red stays the primary "you have something new to see" signal.
  // A story tray showing dozens of identical red rings back-to-back
  // reads as noisy rather than premium, so alternating a subset with
  // the secondary blue accent (purely cosmetic, no semantic meaning)
  // gives the row some visual rhythm - matching the varied red/blue
  // story rings in the design reference - without changing what the
  // ring communicates (still unseen vs. seen).
  ringAccent?: "red" | "blue";
}

export default function StoryCircle({ user, hasUnseen, onClick, storyPreview, storyPreviewType, ringAccent = "red" }: Props) {
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
      <div
        className={`w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full p-[2px] ${
          hasUnseen
            ? ringAccent === "blue"
              ? "bg-gradient-to-tr from-zrp-blue to-blue-300"
              : "bg-gradient-to-tr from-zrp-red to-red-400"
            : "bg-gray-300 dark:bg-gray-600"
        }`}
      >
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
      <span className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-[64px] sm:max-w-[72px]">
        {user.name || user.username}
      </span>
    </button>
  );
}
