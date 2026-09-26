"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Play } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import LinkPreviewInternalCard from "@/components/LinkPreviewInternalCard";
import { classifyInternalLink } from "@/lib/link-preview-internal";

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

// One in-flight/settled request per URL per page load. A conversation
// re-renders its whole message list on every socket event (new message,
// typing, read receipt), and every PostCard in a feed mounts its own
// card - without this each of those re-issued the same /api/link-preview
// request, which both hammered the route and, at 30 lookups/min/IP,
// tripped its rate limit so that later links on the same page silently
// got no preview at all. A negative result isn't kept, so a transient
// failure (429, offline) is retried on the next mount.
const previewCache = new Map<string, Promise<LinkPreview | null>>();

function fetchPreview(url: string): Promise<LinkPreview | null> {
  const existing = previewCache.get(url);
  if (existing) return existing;
  const promise: Promise<LinkPreview | null> = fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
    .then((res) => (res.ok ? (res.json() as Promise<LinkPreview>) : null))
    .then((data) => (data && (data.title || data.image) ? data : null))
    .catch(() => null);
  promise.then((value) => {
    if (value === null) previewCache.delete(url);
  });
  previewCache.set(url, promise);
  return promise;
}

export default function LinkPreviewCard({ url, compact = false, onRemove, onLoaded }: LinkPreviewCardProps) {
  const { t } = useLanguage();
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [imageErrored, setImageErrored] = useState(false);

  // A link to one of ZRP's own posts or profiles is unfurled from the
  // live post/user API into an in-app card (see LinkPreviewInternalCard)
  // - the generic OG scraper can't fetch the app's own origin (SSRF
  // guard, loopback in dev) and shouldn't need to. Any other internal
  // page (a hashtag, the home page) gets no card: the plain link text
  // already navigates in-app.
  const internal = classifyInternalLink(url);
  const internalCard = internal && internal.kind !== "other";

  useEffect(() => {
    if (internal) {
      setLoading(false);
      setFailed(true);
      setPreview(null);
      if (internal.kind === "other") onLoaded?.(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setPreview(null);
    setImageErrored(false);

    fetchPreview(url).then((data) => {
      if (cancelled) return;
      if (data) {
        setPreview(data);
        onLoaded?.(true);
      } else {
        setFailed(true);
        onLoaded?.(false);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // onLoaded is a per-render arrow at every call site; the URL is the
    // identity that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  if (internalCard) {
    return <LinkPreviewInternalCard link={internal} onLoaded={onLoaded} />;
  }

  if (loading) {
    return (
      <div className="mt-2 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-pulse">
        <div className={`w-full bg-gray-100 dark:bg-gray-800 ${compact ? "aspect-[2.5/1]" : "aspect-[1.91/1]"}`} />
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
  let safeHref: string | null = null;
  try {
    const parsed = new URL(preview.url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") safeHref = parsed.toString();
    domain = domain || parsed.hostname.replace(/^www\./, "");
  } catch {
    // keep whatever we have
  }

  // The href comes back from the server (the canonical URL after
  // redirects); never render a card whose target isn't plain http(s).
  if (!safeHref) return null;

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
      className="mt-2 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:bg-gray-50 dark:hover:bg-gray-800/50 transition relative group"
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
          title={t("linkPreview.remove")}
        >
          ✕
        </button>
      )}
      <a
        href={safeHref}
        target="_blank"
        rel="noopener noreferrer"
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-zrp-red focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zrp-deepBlack rounded-2xl"
        aria-label={accessibleLabel}
      >
        {preview.image && !imageErrored && (
          <div
            // A standard OG image ratio (1.91:1, the same one Facebook/
            // Twitter cards use) instead of a fixed pixel height - a
            // fixed height crops very differently on a narrow phone card
            // vs. a wide desktop one, while this keeps the crop
            // proportion (and how "immersive" the thumbnail feels)
            // consistent across every screen size.
            className={`w-full bg-gray-100 dark:bg-gray-800 overflow-hidden relative ${compact ? "aspect-[2.5/1]" : "aspect-[1.91/1]"}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.image}
              alt=""
              aria-hidden="true"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              onError={() => setImageErrored(true)}
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
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500 flex items-center gap-1 mb-1">
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
              {domain}
            </p>
          )}
          {preview.title && (
            <p className="text-[15px] font-semibold text-gray-900 dark:text-white leading-snug line-clamp-2">
              {preview.title}
            </p>
          )}
          {!compact && preview.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-1">
              {preview.description}
            </p>
          )}
        </div>
      </a>
    </div>
  );
}
