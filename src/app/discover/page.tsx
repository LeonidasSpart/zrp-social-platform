"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  ChevronUp,
  ChevronDown,
  Volume2,
  VolumeX,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import ReportModal from "@/components/ReportModal";
import DiscoverSlide from "@/components/discover/DiscoverSlide";
import DiscoverCommentsSheet from "@/components/discover/DiscoverCommentsSheet";
import {
  getProgressEventsToFire,
  shouldFireImpression,
  shouldFireSkip,
  shouldFireStart,
  type DiscoverWatchEventType,
} from "@/lib/discover-watch-client";
import type {
  DiscoverClientItem,
  DiscoverFeedItemDTO,
  DiscoverFeedPageDTO,
  FollowState,
} from "./types";

const PAGE_LIMIT = 10;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

export default function DiscoverPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();

  const [items, setItems] = useState<DiscoverClientItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [paginationError, setPaginationError] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [reportPostId, setReportPostId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const slideElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const ratiosRef = useRef<Map<string, number>>(new Map());
  const firedEventsRef = useRef<Map<string, Set<DiscoverWatchEventType>>>(new Map());

  // Refs mirroring state that the IntersectionObserver callback and the
  // watch-event handlers need to read without becoming stale - the
  // observer instance itself is created once and must never depend on a
  // fresh closure over `items`/`nextCursor` to stay a single stable
  // instance across the whole scroll session.
  const itemsRef = useRef<DiscoverClientItem[]>([]);
  const nextCursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const activePostIdRef = useRef<string | null>(null);
  const sessionUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    activePostIdRef.current = activePostId;
  }, [activePostId]);
  useEffect(() => {
    sessionUserIdRef.current = session?.user?.id ?? null;
  }, [session?.user?.id]);

  useBodyScrollLock(true);

  // ── Toast (report result, transient) ──────────────────────────────
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // ── Mapping helpers ─────────────────────────────────────────────
  const toClientItem = useCallback((dto: DiscoverFeedItemDTO): DiscoverClientItem => {
    const followState: FollowState = dto.viewerState.followsAuthor ? "following" : "none";
    return {
      ...dto,
      followState,
      isOwnPost: sessionUserIdRef.current === dto.author.id,
      progressPct: 0,
    };
  }, []);

  // ── Watch events ─────────────────────────────────────────────────
  const sendEvent = useCallback(
    (postId: string, eventType: DiscoverWatchEventType, watchedMs?: number) => {
      fetch("/api/discover/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // keepalive lets the SKIP fired when the user navigates away
        // (see the unmount cleanup below) actually reach the server
        // instead of being cancelled with the page.
        keepalive: true,
        body: JSON.stringify({
          postId,
          eventType,
          ...(watchedMs !== undefined ? { watchedMs } : {}),
        }),
      }).catch(() => {
        // Watch analytics must never surface an error to the viewer.
      });
    },
    []
  );

  const getFired = useCallback((id: string) => {
    let set = firedEventsRef.current.get(id);
    if (!set) {
      set = new Set();
      firedEventsRef.current.set(id, set);
    }
    return set;
  }, []);

  // ── Initial load / retry ────────────────────────────────────────
  const fetchInitial = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(`/api/discover?limit=${PAGE_LIMIT}`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data: DiscoverFeedPageDTO = await res.json();
      setItems(data.items.map(toClientItem));
      setNextCursor(data.nextCursor);
      nextCursorRef.current = data.nextCursor;
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [toClientItem]);

  // GET /api/discover itself supports anonymous callers (see its own
  // route comment), but every content page in ZRP other than the small
  // PUBLIC_PATHS allowlist in src/middleware.ts already requires a
  // session - middleware redirects an unauthenticated request to
  // /login before this page ever renders. This mirrors src/app/shorts/
  // page.tsx's own client-side redirect for the same reason it exists
  // there: a client-side navigation (<Link>) can still land here with a
  // stale/absent session before the server round-trip settles, and
  // this avoids a flash of feed UI in that window. The backend's
  // anonymous support is intentionally left as-is for future reuse
  // (e.g. a public share surface) rather than widening this page's own
  // exposure beyond what every sibling content page already does.
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  const hasFetchedInitial = useRef(false);
  useEffect(() => {
    if (hasFetchedInitial.current || status !== "authenticated") return;
    hasFetchedInitial.current = true;
    fetchInitial();
  }, [status, fetchInitial]);

  // ── Pagination ───────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !nextCursorRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setPaginationError(false);
    const cursor = nextCursorRef.current;
    try {
      const res = await fetch(`/api/discover?cursor=${encodeURIComponent(cursor)}&limit=${PAGE_LIMIT}`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data: DiscoverFeedPageDTO = await res.json();
      setItems((prev) => {
        const existing = new Set(prev.map((p) => p.id));
        const fresh = data.items.filter((it) => !existing.has(it.id)).map(toClientItem);
        return [...prev, ...fresh];
      });
      nextCursorRef.current = data.nextCursor;
      setNextCursor(data.nextCursor);
    } catch {
      setPaginationError(true);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [toClientItem]);

  // ── Active-slide detection (IntersectionObserver, created once) ──
  const ensureObserver = useCallback(() => {
    if (observerRef.current || !containerRef.current) return observerRef.current;

    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.discoverPostId;
          if (!id) continue;
          ratiosRef.current.set(id, entry.intersectionRatio);
        }

        let bestId: string | null = null;
        let bestRatio = 0;
        ratiosRef.current.forEach((ratio, id) => {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        });

        if (bestRatio >= 0.5 && bestId && bestId !== activePostIdRef.current) {
          setActivePostId(bestId);
        } else if (bestRatio < 0.5 && activePostIdRef.current !== null) {
          // Nothing tracked is sufficiently visible - e.g. the viewer has
          // scrolled past the last video into the end-of-feed card, which
          // isn't itself a tracked slide. Clearing this pauses every
          // loaded video (see the play/pause effect keyed on
          // activePostId) instead of leaving the last one silently
          // playing off-screen.
          setActivePostId(null);
        }

        if (bestId) {
          const idx = itemsRef.current.findIndex((it) => it.id === bestId);
          if (
            idx >= 0 &&
            idx >= itemsRef.current.length - 2 &&
            nextCursorRef.current &&
            !loadingMoreRef.current
          ) {
            loadMore();
          }
        }
      },
      { root: containerRef.current, threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    observerRef.current = obs;
    return obs;
  }, [loadMore]);

  const registerSlideEl = useCallback(
    (id: string, el: HTMLDivElement | null) => {
      const obs = ensureObserver();
      const prevEl = slideElsRef.current.get(id);
      if (prevEl && obs) obs.unobserve(prevEl);

      if (el) {
        slideElsRef.current.set(id, el);
        obs?.observe(el);
      } else {
        slideElsRef.current.delete(id);
        ratiosRef.current.delete(id);
      }
    },
    [ensureObserver]
  );

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, []);

  // ── Active-slide changed: IMPRESSION for the new one, SKIP for the
  //    outgoing one if it started but never finished. ────────────────
  const prevActiveRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevActiveRef.current;
    if (prev && prev !== activePostId) {
      const firedPrev = getFired(prev);
      if (shouldFireSkip(firedPrev)) {
        firedPrev.add("SKIP");
        sendEvent(prev, "SKIP");
      }
    }
    if (activePostId) {
      const firedNew = getFired(activePostId);
      if (shouldFireImpression(firedNew)) {
        firedNew.add("IMPRESSION");
        sendEvent(activePostId, "IMPRESSION");
      }
    }
    prevActiveRef.current = activePostId;
  }, [activePostId, getFired, sendEvent]);

  // Report a SKIP for whatever was active when the viewer navigates
  // away entirely (unmount) - the same rule as switching slides.
  useEffect(() => {
    return () => {
      const id = activePostIdRef.current;
      if (!id) return;
      const fired = getFired(id);
      if (shouldFireSkip(fired)) {
        fired.add("SKIP");
        sendEvent(id, "SKIP");
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Play only the active video, pause every other loaded one ─────
  useEffect(() => {
    Object.entries(videoRefs.current).forEach(([id, el]) => {
      if (!el) return;
      if (id === activePostId) {
        el.muted = muted;
        el.play().catch(() => {});
      } else {
        el.pause();
      }
    });
  }, [activePostId, muted]);

  const registerVideoEl = useCallback((id: string, el: HTMLVideoElement | null) => {
    videoRefs.current[id] = el;
  }, []);

  const handlePlaying = useCallback(
    (id: string) => {
      const fired = getFired(id);
      if (shouldFireStart(fired)) {
        fired.add("START");
        sendEvent(id, "START");
      }
    },
    [getFired, sendEvent]
  );

  const handleTimeUpdate = useCallback(
    (id: string, currentTime: number, duration: number) => {
      if (id !== activePostIdRef.current) return;

      const fired = getFired(id);
      const toFire = getProgressEventsToFire(currentTime, duration, fired);
      for (const type of toFire) {
        fired.add(type);
        sendEvent(id, type, Math.round(currentTime * 1000));
      }

      if (Number.isFinite(duration) && duration > 0) {
        const pct = Math.min(100, (currentTime / duration) * 100);
        setItems((prev) => prev.map((it) => (it.id === id ? { ...it, progressPct: pct } : it)));
      }
    },
    [getFired, sendEvent]
  );

  const handleVideoError = useCallback((_id: string) => {
    // Rendering already swaps to the playback-error slide via DiscoverSlide's
    // own local state - nothing else needs to happen feed-side. A failed
    // video never gets removed from the list (unlike Shorts' onError,
    // which drops it) because Discover's server-ranked ordering/cursor
    // pagination assumes a stable list; the user can still scroll past it.
  }, []);

  // ── Navigation (keyboard + on-screen buttons, never gesture-only) ─
  const scrollToId = useCallback((id: string) => {
    const el = slideElsRef.current.get(id);
    const container = containerRef.current;
    if (!el || !container) return;
    container.scrollTo({ top: el.offsetTop, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, []);

  const goToOffset = useCallback(
    (offset: number) => {
      const ids = itemsRef.current.map((it) => it.id);
      const idx = activePostId ? ids.indexOf(activePostId) : -1;
      const nextIdx = Math.max(0, Math.min(ids.length - 1, idx + offset));
      const nextId = ids[nextIdx];
      if (nextId && nextId !== activePostId) scrollToId(nextId);
    },
    [activePostId, scrollToId]
  );

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        goToOffset(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        goToOffset(-1);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goToOffset]);

  // ── Social actions (all reuse the existing ZRP APIs) ──────────────
  const requireAuth = useCallback(() => {
    if (session) return true;
    router.push("/login");
    return false;
  }, [session, router]);

  const handleToggleLike = useCallback(
    (id: string) => {
      if (!requireAuth()) return;
      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? {
                ...it,
                viewerState: { ...it.viewerState, liked: !it.viewerState.liked },
                stats: {
                  ...it.stats,
                  likes: it.viewerState.liked ? Math.max(0, it.stats.likes - 1) : it.stats.likes + 1,
                },
              }
            : it
        )
      );
      fetch(`/api/posts/${id}/like`, { method: "POST" })
        .then((res) => {
          if (!res.ok) throw new Error("failed");
        })
        .catch(() => {
          setItems((prev) =>
            prev.map((it) =>
              it.id === id
                ? {
                    ...it,
                    viewerState: { ...it.viewerState, liked: !it.viewerState.liked },
                    stats: {
                      ...it.stats,
                      likes: it.viewerState.liked ? Math.max(0, it.stats.likes - 1) : it.stats.likes + 1,
                    },
                  }
                : it
            )
          );
        });
    },
    [requireAuth]
  );

  const handleToggleRepost = useCallback(
    async (id: string) => {
      if (!requireAuth()) return;
      try {
        const res = await fetch(`/api/posts/${id}/repost`, { method: "POST" });
        if (res.ok) {
          const data = await res.json();
          setItems((prev) =>
            prev.map((it) =>
              it.id === id
                ? {
                    ...it,
                    viewerState: { ...it.viewerState, reposted: data.reposted },
                    stats: {
                      ...it.stats,
                      reposts: data.reposted
                        ? it.stats.reposts + 1
                        : Math.max(0, it.stats.reposts - 1),
                    },
                  }
                : it
            )
          );
        }
      } catch {
        // Leave state as-is - no optimistic change was made yet.
      }
    },
    [requireAuth]
  );

  const handleToggleSave = useCallback(
    async (id: string) => {
      if (!requireAuth()) return;
      setItems((prev) =>
        prev.map((it) =>
          it.id === id ? { ...it, viewerState: { ...it.viewerState, saved: !it.viewerState.saved } } : it
        )
      );
      try {
        const res = await fetch(`/api/posts/${id}/bookmark`, { method: "POST" });
        if (res.ok) {
          const data = await res.json();
          setItems((prev) =>
            prev.map((it) =>
              it.id === id ? { ...it, viewerState: { ...it.viewerState, saved: data.bookmarked } } : it
            )
          );
        } else {
          throw new Error("failed");
        }
      } catch {
        setItems((prev) =>
          prev.map((it) =>
            it.id === id ? { ...it, viewerState: { ...it.viewerState, saved: !it.viewerState.saved } } : it
          )
        );
      }
    },
    [requireAuth]
  );

  const handleToggleFollow = useCallback(
    async (item: DiscoverClientItem) => {
      if (!requireAuth()) return;
      const prevState = item.followState;
      const authorId = item.author.id;
      const optimistic: FollowState = prevState === "following" ? "none" : "following";

      setItems((prev) =>
        prev.map((it) => (it.author.id === authorId ? { ...it, followState: optimistic } : it))
      );

      try {
        const res = await fetch(`/api/users/${item.author.username}/follow`, { method: "POST" });
        if (!res.ok) throw new Error("failed");
        const data: { following: boolean; requested: boolean } = await res.json();
        const resolved: FollowState = data.following ? "following" : data.requested ? "requested" : "none";
        setItems((prev) =>
          prev.map((it) => (it.author.id === authorId ? { ...it, followState: resolved } : it))
        );
      } catch {
        setItems((prev) =>
          prev.map((it) => (it.author.id === authorId ? { ...it, followState: prevState } : it))
        );
      }
    },
    [requireAuth]
  );

  const handleShare = useCallback(
    async (item: DiscoverClientItem) => {
      const url = `${window.location.origin}/post/${item.id}`;
      if (navigator.share) {
        try {
          await navigator.share({
            title: t("shorts.sharePostBy", { name: item.author.name || item.author.username }),
            url,
          });
        } catch {
          // User cancelled - not an error.
        }
      } else {
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          // Clipboard unavailable - nothing more we can do silently.
        }
      }
    },
    [t]
  );

  const handleCommentAdded = useCallback(
    (delta?: number) => {
      if (!commentsPostId || !delta) return;
      setItems((prev) =>
        prev.map((it) =>
          it.id === commentsPostId
            ? { ...it, stats: { ...it.stats, comments: Math.max(0, it.stats.comments + delta) } }
            : it
        )
      );
    },
    [commentsPostId]
  );

  const handleReportSubmit = useCallback(
    async (reason: string, details?: string) => {
      if (!reportPostId) return;
      try {
        const res = await fetch("/api/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postId: reportPostId, reason, details }),
        });
        if (res.ok) {
          setToast(t("discover.reportSubmitted"));
        } else {
          setToast(t("discover.reportFailed"));
        }
      } catch {
        setToast(t("discover.reportFailed"));
      } finally {
        setReportPostId(null);
      }
    },
    [reportPostId, t]
  );

  const isAuthenticated = !!session;
  const activeIndex = activePostId ? items.findIndex((it) => it.id === activePostId) : -1;

  // ── Loading ──────────────────────────────────────────────────────
  if (status === "loading" || status === "unauthenticated" || loading) {
    return (
      <div className="fixed inset-0 bg-black z-[100] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white animate-spin" aria-label={t("action.loading")} />
      </div>
    );
  }

  // ── Load failure ─────────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="fixed inset-0 bg-black z-[100] flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-white">{t("discover.loadFailed")}</p>
        <button
          type="button"
          onClick={fetchInitial}
          className="inline-flex items-center gap-2 text-white bg-white/10 rounded-full px-4 py-2 hover:bg-white/20 transition"
        >
          <RotateCcw className="w-4 h-4" aria-hidden="true" />
          {t("action.retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-[100]">
      {/* BACK */}
      <button
        type="button"
        onClick={() => router.push("/")}
        className="absolute top-[calc(1rem+env(safe-area-inset-top))] left-4 z-30 text-white bg-black/40 rounded-full p-2 hover:bg-black/60 transition"
        aria-label={t("shorts.back")}
      >
        <ArrowLeft className="w-6 h-6 rtl:-scale-x-100" />
      </button>

      {/* TITLE */}
      <h1 className="absolute top-[calc(1rem+env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-30 text-white font-semibold text-lg">
        {t("nav.discover")}
      </h1>

      {/* MUTE */}
      {items.length > 0 && (
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          className="absolute top-[calc(1rem+env(safe-area-inset-top))] right-4 z-30 text-white bg-black/40 rounded-full p-2 hover:bg-black/60 transition"
          aria-label={muted ? t("shorts.unmute") : t("shorts.mute")}
        >
          {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      )}

      {/* PREV / NEXT - explicit, non-gesture navigation (accessibility
          requirement: never gesture-only). Vertically centered on the
          left edge so they never collide with the author/caption block
          (bottom-left) or the action rail (bottom-right). */}
      {items.length > 1 && (
        <div className="absolute left-2 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => goToOffset(-1)}
            disabled={activeIndex <= 0}
            aria-label={t("discover.previousVideo")}
            className="text-white bg-black/40 rounded-full p-2 hover:bg-black/60 transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronUp className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => goToOffset(1)}
            disabled={activeIndex >= 0 && activeIndex >= items.length - 1 && !nextCursor}
            aria-label={t("discover.nextVideo")}
            className="text-white bg-black/40 rounded-full p-2 hover:bg-black/60 transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="absolute top-[calc(4rem+env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-40 max-w-[90vw] rounded-full bg-black/80 text-white text-sm px-4 py-2 text-center"
        >
          {toast}
        </div>
      )}

      {/* EMPTY */}
      {items.length === 0 ? (
        <div className="h-full w-full flex flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-white">{t("shorts.noVideosAvailable")}</p>
          <Link
            href="/"
            className="text-white bg-white/10 rounded-full px-4 py-2 hover:bg-white/20 transition"
          >
            {t("shorts.back")}
          </Link>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="h-full w-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
          style={{ scrollbarWidth: "none" }}
        >
          {items.map((item) => (
            <div
              key={item.id}
              ref={(el) => registerSlideEl(item.id, el)}
              data-discover-post-id={item.id}
              className="h-full w-full snap-start snap-always"
            >
              <DiscoverSlide
                item={item}
                isActive={item.id === activePostId}
                muted={muted}
                isAuthenticated={isAuthenticated}
                registerVideoEl={registerVideoEl}
                onTimeUpdate={handleTimeUpdate}
                onPlaying={handlePlaying}
                onError={handleVideoError}
                onToggleLike={handleToggleLike}
                onToggleRepost={handleToggleRepost}
                onToggleSave={handleToggleSave}
                onToggleFollow={handleToggleFollow}
                onOpenComments={setCommentsPostId}
                onShare={handleShare}
                onReport={setReportPostId}
              />
            </div>
          ))}

          {/* END OF FEED - a real snap section, not a toast, so it's
              reachable the same way any other slide is (scroll/keyboard/
              prev-next buttons), matching the "must have a usable UI"
              requirement for the end-of-feed case. */}
          {!nextCursor && !loadingMore && (
            <div className="h-full w-full snap-start snap-always flex flex-col items-center justify-center gap-3 px-6 text-center text-white">
              <p className="text-lg font-semibold">{t("discover.endOfFeed")}</p>
              <button
                type="button"
                onClick={() => {
                  containerRef.current?.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
                }}
                className="text-white bg-white/10 rounded-full px-4 py-2 hover:bg-white/20 transition"
              >
                {t("shorts.back")}
              </button>
            </div>
          )}

          {loadingMore && (
            <div className="h-24 w-full flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            </div>
          )}

          {paginationError && !loadingMore && (
            <div className="h-24 w-full flex items-center justify-center">
              <button
                type="button"
                onClick={loadMore}
                className="inline-flex items-center gap-2 text-white bg-white/10 rounded-full px-4 py-2 hover:bg-white/20 transition text-sm"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                {t("action.retry")}
              </button>
            </div>
          )}
        </div>
      )}

      {/* COMMENTS */}
      {commentsPostId && (
        <DiscoverCommentsSheet
          postId={commentsPostId}
          onClose={() => setCommentsPostId(null)}
          onCommentAdded={handleCommentAdded}
        />
      )}

      {/* REPORT */}
      <ReportModal
        isOpen={!!reportPostId}
        onClose={() => setReportPostId(null)}
        onSubmit={handleReportSubmit}
      />
    </div>
  );
}
