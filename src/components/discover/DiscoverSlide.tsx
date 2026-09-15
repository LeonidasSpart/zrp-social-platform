"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Heart,
  MessageCircle,
  Repeat,
  Share2,
  Bookmark,
  Lock,
  AlertTriangle,
  MoreHorizontal,
  UserPlus,
  Check,
  Clock,
  X,
} from "lucide-react";
import VerifiedBadge from "@/components/VerifiedBadge";
import ParsedContent from "@/components/ParsedContent";
import { useLanguage } from "@/contexts/LanguageContext";
import { getCaptionDisplayState } from "@/lib/shortsCaption";
import type { DiscoverClientItem, FollowState } from "@/app/discover/types";

function formatCount(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toString();
}

interface DiscoverSlideProps {
  item: DiscoverClientItem;
  isActive: boolean;
  muted: boolean;
  isAuthenticated: boolean;
  registerVideoEl: (id: string, el: HTMLVideoElement | null) => void;
  onTimeUpdate: (id: string, currentTime: number, duration: number) => void;
  onPlaying: (id: string) => void;
  onError: (id: string) => void;
  onToggleLike: (id: string) => void;
  onToggleRepost: (id: string) => void;
  onToggleSave: (id: string) => void;
  onToggleFollow: (item: DiscoverClientItem) => void;
  onOpenComments: (id: string) => void;
  onShare: (item: DiscoverClientItem) => void;
  onReport: (id: string) => void;
  onNotInterested: (id: string) => void;
  onMuteCreator: (item: DiscoverClientItem) => void;
  onBlockCreator: (item: DiscoverClientItem) => void;
}

const timeAgoParts = (iso: string): { minutes: number; hours: number; days: number } => {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  return { minutes, hours: Math.floor(minutes / 60), days: Math.floor(minutes / 60 / 24) };
};

export default function DiscoverSlide({
  item,
  isActive,
  muted,
  isAuthenticated,
  registerVideoEl,
  onTimeUpdate,
  onPlaying,
  onError,
  onToggleLike,
  onToggleRepost,
  onToggleSave,
  onToggleFollow,
  onOpenComments,
  onShare,
  onReport,
  onNotInterested,
  onMuteCreator,
  onBlockCreator,
}: DiscoverSlideProps) {
  const { t } = useLanguage();
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);

  const locked = item.premiumPost?.locked === true;

  const timeAgo = () => {
    const { minutes, hours, days } = timeAgoParts(item.createdAt);
    if (minutes < 1) return t("notifications.justNow");
    if (minutes < 60) return t("time.minutesShort", { n: minutes });
    if (hours < 24) return t("time.hoursShort", { n: hours });
    return t("time.daysShort", { n: days });
  };

  const { isLong, displayText } = item.caption
    ? getCaptionDisplayState(item.caption, captionExpanded)
    : { isLong: false, displayText: "" };

  const followLabel: Record<FollowState, string> = {
    none: t("action.follow"),
    following: t("action.following"),
    requested: t("action.requested"),
  };

  return (
    <div
      className="relative h-full w-full snap-start snap-always flex items-center justify-center bg-black"
      data-discover-post-id={item.id}
    >
      {locked ? (
        <div className="flex flex-col items-center gap-3 px-8 text-center text-white">
          <div className="rounded-full bg-white/10 p-4">
            <Lock className="w-8 h-8" aria-hidden="true" />
          </div>
          <p className="font-semibold">{t("shorts.premiumLockedTitle")}</p>
          {item.premiumPost && (
            <p className="text-sm text-white/70">
              {t("shorts.premiumLockedBody", {
                price: item.premiumPost.price,
                currency: item.premiumPost.currency,
              })}
            </p>
          )}
          <Link
            href={`/post/${item.id}`}
            className="mt-2 rounded-full bg-white/15 px-4 py-2 text-sm font-medium hover:bg-white/25 transition"
          >
            {t("shorts.premiumLockedCta")}
          </Link>
        </div>
      ) : playbackError ? (
        <div className="flex flex-col items-center gap-3 px-8 text-center text-white">
          <div className="rounded-full bg-white/10 p-4">
            <AlertTriangle className="w-8 h-8" aria-hidden="true" />
          </div>
          <p className="text-sm text-white/80">{t("discover.playbackError")}</p>
        </div>
      ) : (
        <video
          ref={(el) => registerVideoEl(item.id, el)}
          src={item.media.url ?? undefined}
          className="max-h-full max-w-full object-contain"
          loop
          muted={muted}
          playsInline
          webkit-playsinline="true"
          preload="metadata"
          controls={false}
          aria-label={item.caption || undefined}
          onPlaying={() => onPlaying(item.id)}
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            onTimeUpdate(item.id, el.currentTime, el.duration);
          }}
          onError={() => {
            setPlaybackError(true);
            onError(item.id);
          }}
          onClick={(e) => {
            const el = e.currentTarget;
            if (el.paused) el.play().catch(() => {});
            else el.pause();
          }}
        />
      )}

      {/* BOTTOM OVERLAY: author, caption, action rail. Same safe-area
          reasoning as the existing shorts/page.tsx and VideoFeedViewer -
          BottomNav is a fixed portal above this overlay on mobile, so its
          real footprint (h-14 + its own safe-area inset) is reserved,
          not just a flat padding guess. */}
      <div className="absolute inset-x-0 bottom-0 p-4 pb-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none">
        <div className="flex items-end justify-between gap-4">
          {/* AUTHOR + CAPTION */}
          <div className="flex-1 min-w-0 text-white pointer-events-auto">
            <div className="flex min-w-0 items-center gap-2 mb-2">
              <Link href={`/profile/${item.author.username}`} className="flex min-w-0 items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-gray-700 overflow-hidden flex-shrink-0">
                  {item.author.avatarUrl ? (
                    <img
                      src={item.author.avatarUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-bold">
                      {(item.author.name || item.author.username).charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <span className="font-semibold flex min-w-0 items-center gap-1">
                  <span className="truncate">{item.author.name || item.author.username}</span>
                  <VerifiedBadge badgeType={item.author.badgeType} className="flex-shrink-0" />
                </span>
                <span className="text-white/70 text-sm flex-shrink-0">· {timeAgo()}</span>
              </Link>

              {!item.isOwnPost && (
                <button
                  type="button"
                  onClick={() => onToggleFollow(item)}
                  aria-pressed={item.followState === "following"}
                  className={`ml-1 flex-shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                    item.followState === "following"
                      ? "bg-white/15 text-white"
                      : item.followState === "requested"
                      ? "bg-white/10 text-white/70"
                      : "bg-white text-black hover:bg-white/90"
                  }`}
                >
                  {item.followState === "following" ? (
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : item.followState === "requested" ? (
                    <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : (
                    <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  {followLabel[item.followState]}
                </button>
              )}
            </div>

            {item.caption && (
              isLong ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCaptionExpanded((v) => !v);
                  }}
                  aria-expanded={captionExpanded}
                  className="block w-full text-left"
                >
                  <span
                    className={`block text-sm whitespace-pre-wrap break-words ${
                      captionExpanded ? "max-h-[45vh] overflow-y-auto" : ""
                    }`}
                  >
                    <ParsedContent content={displayText} urlClassName="text-white underline break-all" />
                  </span>
                  <span className="mt-0.5 block text-sm font-semibold text-white/80">
                    {t(captionExpanded ? "rightPanel.showLess" : "rightPanel.showMore")}
                  </span>
                </button>
              ) : (
                <p className="text-sm whitespace-pre-wrap break-words">
                  <ParsedContent content={item.caption} urlClassName="text-white underline break-all" />
                </p>
              )
            )}
          </div>

          {/* ACTION RAIL */}
          <div className="flex flex-col items-center gap-4 flex-shrink-0 text-white pointer-events-auto">
            <button
              type="button"
              onClick={() => onToggleLike(item.id)}
              className="flex flex-col items-center gap-1"
              aria-label={t("shorts.like")}
              aria-pressed={item.viewerState.liked}
            >
              <Heart className={`w-7 h-7 ${item.viewerState.liked ? "fill-red-500 text-red-500" : ""}`} />
              <span className="text-xs">{formatCount(item.stats.likes)}</span>
            </button>

            {item.commentsEnabled && (
              <button
                type="button"
                onClick={() => onOpenComments(item.id)}
                className="flex flex-col items-center gap-1"
                aria-label={t("discover.comments")}
              >
                <MessageCircle className="w-7 h-7" />
                <span className="text-xs">{formatCount(item.stats.comments)}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onToggleRepost(item.id)}
              className="flex flex-col items-center gap-1"
              aria-label={t("shorts.repost")}
              aria-pressed={item.viewerState.reposted}
            >
              <Repeat className={`w-7 h-7 ${item.viewerState.reposted ? "text-green-500" : ""}`} />
              <span className="text-xs">{formatCount(item.stats.reposts)}</span>
            </button>

            <button
              type="button"
              onClick={() => onToggleSave(item.id)}
              className="flex flex-col items-center gap-1"
              aria-label={t("nav.bookmarks")}
              aria-pressed={item.viewerState.saved}
            >
              <Bookmark className={`w-7 h-7 ${item.viewerState.saved ? "fill-white text-white" : ""}`} />
            </button>

            <button
              type="button"
              onClick={() => onShare(item)}
              className="flex flex-col items-center gap-1"
              aria-label={t("shorts.share")}
            >
              <Share2 className="w-7 h-7" />
            </button>

            {/* "Why am I seeing this?" is transparency, available to
                everyone (including an anonymous or own-post viewer) -
                the same menu button, but the moderation-adjacent items
                below it only render for a signed-in viewer looking at
                someone else's post, same as before. */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="flex flex-col items-center gap-1"
                aria-label={t("discover.more")}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <MoreHorizontal className="w-6 h-6" />
              </button>

              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div
                    role="menu"
                    className="absolute bottom-full end-0 mb-2 w-52 rounded-lg bg-white dark:bg-gray-800 shadow-lg overflow-hidden z-20 text-gray-900 dark:text-white"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        setWhyOpen(true);
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                    >
                      {t("discover.whyAmISeeing")}
                    </button>

                    {isAuthenticated && !item.isOwnPost && (
                      <>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false);
                            onNotInterested(item.id);
                          }}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                        >
                          {t("discover.notInterested")}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false);
                            onMuteCreator(item);
                          }}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                        >
                          {t("discover.muteCreator")}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false);
                            onBlockCreator(item);
                          }}
                          className="w-full text-left px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                        >
                          {t("discover.blockCreator")}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false);
                            onReport(item.id);
                          }}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                        >
                          {t("report.modalTitle")}
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}

              {whyOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setWhyOpen(false)}
                  />
                  <div
                    role="dialog"
                    aria-label={t("discover.whyAmISeeing")}
                    className="absolute bottom-full end-0 mb-2 w-64 rounded-lg bg-white dark:bg-gray-800 shadow-lg p-4 z-40 text-gray-900 dark:text-white"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="font-semibold text-sm">{t("discover.whyAmISeeing")}</p>
                      <button
                        type="button"
                        onClick={() => setWhyOpen(false)}
                        aria-label={t("discover.closeExplanation")}
                        className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      {item.reason === "recent"
                        ? t("discover.reasonRecent")
                        : t("discover.reasonPopular")}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Progress indicator for the active slide - a thin bar the
          parent drives from the same timeupdate feed as the watch-event
          logic, not a second video listener. */}
      {isActive && !locked && !playbackError && (
        <div className="absolute top-0 inset-x-0 h-0.5 bg-white/20" aria-hidden="true">
          <div
            className="h-full bg-white transition-[width] duration-150 ease-linear"
            style={{ width: `${Math.min(100, item.progressPct ?? 0)}%` }}
          />
        </div>
      )}
    </div>
  );
}
