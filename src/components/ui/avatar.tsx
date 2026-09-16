"use client";

import { useState } from "react";
import { colorForName, initialsForName } from "@/lib/avatar-fallback";

interface AvatarProps {
  src?: string | null;
  alt: string;
  /**
   * Text used to derive the initials fallback shown when there is no
   * image, or the image fails to load. Defaults to `alt`. Kept separate
   * from `alt` because callers sometimes pass alt="" for a decorative
   * avatar sitting next to a text link that already carries the
   * accessible name (see AdminUserIdentity) - that name still needs to
   * reach the fallback even though it isn't the image's alt text.
   */
  name?: string;
  className?: string;
}

/**
 * A user avatar with a real fallback: if there's no image, or the real
 * one fails to load (deleted upload, broken URL, offline CDN), this
 * renders generated initials on a deterministic color instead of ever
 * showing a browser's broken-image icon. There is deliberately no
 * "/default-avatar.png" placeholder file to fall back to - a missing
 * static asset is exactly what produced the broken-image icon this
 * replaces (see docs/subscriptions.md admin dashboard fix history).
 */
export function Avatar({ src, alt, name, className = "" }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const fallbackName = name ?? alt;

  if (!src || failed) {
    return (
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-medium text-xs shrink-0 select-none ${className}`}
        style={{ backgroundColor: colorForName(fallbackName || "?") }}
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
      >
        {initialsForName(fallbackName || "?")}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={`w-10 h-10 rounded-full object-cover shrink-0 ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
