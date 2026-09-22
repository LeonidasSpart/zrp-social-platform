"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useLanguage } from "@/contexts/LanguageContext";

interface ImageLightboxProps {
  /** `null` renders nothing - callers gate this on their own "is open" state. */
  src: string | null;
  alt: string;
  onClose: () => void;
}

/**
 * A single full-size image in a dismissible overlay.
 *
 * Generic on purpose - the only two full-size viewers that existed
 * before this (PostCard's multi-image gallery, ChatInterface's/
 * GroupChatInterface's attachment viewer) are each hand-rolled for
 * their own gallery/download needs and stay as they are. This is for
 * the simpler "one image, no gallery" case - first used for profile
 * avatars, reusable for anything else that ever needs the same thing
 * (a banner, a single post image) without inventing a third bespoke
 * overlay.
 */
export function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  const { t } = useLanguage();
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

  // A fresh image swapped in while the viewer is already open (unlikely
  // for a single avatar, but this stays correct if a future caller
  // reuses it for something that can change mid-view) starts its own
  // loading state instead of showing the previous image's resolved one.
  useEffect(() => {
    setStatus("loading");
  }, [src]);

  useBodyScrollLock(src !== null);

  useEffect(() => {
    if (!src) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [src, onClose]);

  if (!src) return null;

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center bg-black/90 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
    >
      {/* No stopPropagation here on purpose: tapping the photo itself
          also closes the viewer, the same as PostCard's own lightbox
          (see profile-regressions.test.ts's "image lightbox" describe
          block for the exact bug this avoids - an inner wrapper sized
          to fill nearly the whole dialog, whose own stopPropagation
          then ate almost every click, leaving only a thin backdrop
          strip that actually closed anything). Only the close button
          below needs its own stopPropagation, so its click isn't
          double-counted by also bubbling to this dialog's onClose. */}
      <div className="relative flex h-full max-h-[92vh] w-full max-w-3xl items-center justify-center">
        {status === "loading" && (
          <Loader2 className="h-10 w-10 animate-spin text-white/80" aria-hidden="true" />
        )}

        {status === "error" && (
          <p className="rounded-lg bg-black/40 px-4 py-3 text-sm text-white/90">
            {t("explore.errFailedLoad")}
          </p>
        )}

        <img
          src={src}
          alt={alt}
          draggable={false}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
          className={`max-h-full max-w-full select-none rounded-sm object-contain ${
            status === "loaded" ? "" : "hidden"
          }`}
        />

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          aria-label={t("post.closeImageAria")}
          className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80 sm:right-2 sm:top-2"
        >
          <X className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}
