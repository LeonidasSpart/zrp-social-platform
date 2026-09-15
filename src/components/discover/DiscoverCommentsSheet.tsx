"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import Comments from "@/components/Comments";
import { useLanguage } from "@/contexts/LanguageContext";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

interface DiscoverCommentsSheetProps {
  postId: string;
  onClose: () => void;
  onCommentAdded: (delta?: number) => void;
}

/**
 * Comments for a Discover slide, presented as a bottom sheet on
 * mobile/tablet (drawn up from the bottom, matching the platform-native
 * pattern for this width) and a right-docked panel on desktop, where a
 * bottom sheet would cover most of a wide viewport for no reason. Both
 * are the SAME underlying <Comments> component (src/components/Comments.tsx)
 * ZRP already uses on the full post page - no second comment backend or
 * comment UI, only a different container.
 *
 * Locks background scroll while open (useBodyScrollLock's reference
 * count means this composes safely with the page's own video-feed
 * scroll lock) and is dismissible via the close button, Escape, or
 * tapping the scrim - never gesture-only, per the accessibility
 * requirement that this isn't a swipe-only surface.
 */
export default function DiscoverCommentsSheet({
  postId,
  onClose,
  onCommentAdded,
}: DiscoverCommentsSheetProps) {
  const { t } = useLanguage();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useBodyScrollLock(true);

  useEffect(() => {
    closeButtonRef.current?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end sm:items-center sm:justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={t("discover.comments")}
    >
      {/* Scrim */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet: full-width, bottom-anchored, capped height on mobile;
          a fixed-width right-docked panel from sm and up. */}
      <div
        className="relative w-full sm:w-[420px] sm:h-full max-h-[85vh] sm:max-h-none bg-white dark:bg-zrp-deepBlack rounded-t-2xl sm:rounded-none shadow-xl flex flex-col overflow-hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-white">
            {t("discover.comments")}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={t("discover.closeComments")}
            className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
          <Comments postId={postId} onCommentAdded={onCommentAdded} />
        </div>
      </div>
    </div>
  );
}
