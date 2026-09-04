"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Play } from "lucide-react";

interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  isVideo?: boolean;
}

interface LinkPreviewCardProps {
  url: string;
  compact?: boolean; // used in the composer's smaller inline preview
  onRemove?: () => void;
  onLoaded?: (found: boolean) => void;
}

export default function LinkPreviewCard({ url, compact = false, onRemove, onLoaded }: LinkPreviewCardProps) {
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setPreview(null);

    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: LinkPreview | null) => {
        if (cancelled) return;
        if (data && (data.title || data.image)) {
          setPreview(data);
          onLoaded?.(true);
        } else {
          setFailed(true);
          onLoaded?.(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          onLoaded?.(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (loading) {
    return (
      <div className="mt-2 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-pulse">
        <div className="h-32 bg-gray-100 dark:bg-gray-800" />
        <div className="p-3 space-y-2">
          <div className="h-3 w-1/3 bg-gray-100 dark:bg-gray-800 rounded" />
          <div className="h-4 w-2/3 bg-gray-100 dark:bg-gray-800 rounded" />
        </div>
      </div>
    );
  }

  // No usable preview data (link is fine, just nothing to unfurl) -
  // don't show a broken-looking empty card, the link itself is already
  // clickable in the post text.
  if (failed || !preview) {
    return null;
  }

  let domain = preview.siteName || "";
  try {
    domain = domain || new URL(preview.url).hostname.replace(/^www\./, "");
  } catch {
    // keep whatever we have
  }

  // isVideo covers any publisher whose page metadata (og:type=video,
  // twitter:card=player) says so - not just YouTube - so a 20min.ch
  // video article gets the same "this plays" affordance. This never
  // embeds a player; it's purely a visual indicator, and the card still
  // just opens the original page.
  const isVideo = preview.isVideo === true;
  const isYouTube = preview.siteName === "YouTube";
  const accessibleLabel = isYouTube
    ? `Play "${preview.title || "video"}" on YouTube`
    : isVideo
    ? `Watch "${preview.title || "video"}" on ${domain}`
    : preview.title
    ? `${preview.title} - ${domain}`
    : domain;

  return (
    <div
      className="mt-2 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:bg-gray-50 dark:hover:bg-gray-800/50 transition relative"
      onClick={(e) => e.stopPropagation()}
    >
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onRemove();
          }}
          className="absolute top-2 right-2 z-10 bg-black/60 hover:bg-black/80 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm"
          title="Remove link preview"
        >
          ✕
        </button>
      )}
      <a
        href={preview.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-zrp-red focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zrp-deepBlack rounded-2xl"
        aria-label={accessibleLabel}
      >
        {preview.image && (
          <div
            className={`w-full bg-gray-100 dark:bg-gray-800 ${compact ? "h-28" : "h-48"} overflow-hidden relative`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.image}
              alt=""
              aria-hidden="true"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            {(isYouTube || isVideo) && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-zrp-red/90 rounded-full p-3 shadow-lg">
                  <Play className="w-6 h-6 text-white fill-white" />
                </div>
              </div>
            )}
          </div>
        )}
        <div className="p-3">
          {domain && (
            <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1 mb-0.5">
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
              {domain}
            </p>
          )}
          {preview.title && (
            <p className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2">
              {preview.title}
            </p>
          )}
          {!compact && preview.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">
              {preview.description}
            </p>
          )}
        </div>
      </a>
    </div>
  );
}
