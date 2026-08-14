"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

interface LinkPreviewCardProps {
  url: string;
  compact?: boolean; // used in the composer's smaller inline preview
  onRemove?: () => void;
}

export default function LinkPreviewCard({ url, compact = false, onRemove }: LinkPreviewCardProps) {
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
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
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
      <a href={preview.url} target="_blank" rel="noopener noreferrer" className="block">
        {preview.image && (
          <div className={`w-full bg-gray-100 dark:bg-gray-800 ${compact ? "h-28" : "h-48"} overflow-hidden`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.image}
              alt={preview.title || domain}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        )}
        <div className="p-3">
          {domain && (
            <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1 mb-0.5">
              <ExternalLink className="w-3 h-3" />
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
