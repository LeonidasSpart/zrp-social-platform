"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X, ZoomIn, ZoomOut } from "lucide-react";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useLanguage } from "@/contexts/LanguageContext";

interface ImageLightboxProps {
  /** `null` renders nothing - callers gate this on their own "is open" state. */
  src: string | null;
  alt: string;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP_PX = 25;
const DRAG_SLOP_PX = 6;

/** The marker this viewer leaves on the history entry it pushes while open. */
const HISTORY_KEY = "zrpLightbox";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

type Point = { x: number; y: number };

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
 *
 * Rendered through a portal onto <body>. Inline, the `fixed` overlay
 * was flattened into whatever stacking context its caller happened to
 * sit in (the profile header's `relative z-10` wrapper, a PostCard's
 * article), which put it *under* the sticky Header (z-50), the cookie
 * banner (z-50), BottomNav (portal, z-[9999]) and the music mini
 * player (z-[9998]) - the image opened, but the shell drew over it
 * and its close button. From <body>, at a z-index above every one of
 * those, it is genuinely the topmost layer.
 *
 * Also handles: the hardware/browser Back button (closes the viewer
 * instead of leaving the page), pinch-to-zoom and drag-to-pan on
 * touch, wheel/trackpad zoom on desktop, double-tap/double-click to
 * toggle zoom, +/-/0 and arrow keys, focus return to the opener.
 */
export function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  const { t } = useLanguage();
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });

  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // Live refs so pointer/wheel handlers (registered once) always see
  // the current values without being re-bound on every render.
  const scaleRef = useRef(1);
  const offsetRef = useRef<Point>({ x: 0, y: 0 });
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{ startDist: number; startScale: number } | null>(null);
  const drag = useRef<{ last: Point; moved: boolean } | null>(null);
  const lastTap = useRef<{ at: number; point: Point } | null>(null);

  // A fresh image swapped in while the viewer is already open (unlikely
  // for a single avatar, but this stays correct if a future caller
  // reuses it for something that can change mid-view) starts its own
  // loading state instead of showing the previous image's resolved one,
  // and at 1:1 rather than the previous image's zoom.
  useEffect(() => {
    setStatus("loading");
    setScale(1);
    setOffset({ x: 0, y: 0 });
    scaleRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
  }, [src]);

  useBodyScrollLock(src !== null);

  /**
   * Keeps the image inside reach: at scale 1 it is centred and cannot
   * be dragged at all; zoomed in, it can be panned until its far edge
   * meets the stage's edge, never further (so it can't be "lost").
   */
  const applyTransform = useCallback((nextScale: number, nextOffset: Point) => {
    const s = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    const stage = stageRef.current;
    const img = imgRef.current;
    let o = nextOffset;
    if (s === MIN_SCALE) {
      o = { x: 0, y: 0 };
    } else if (stage && img) {
      // offsetWidth/Height are layout sizes - unaffected by the transform.
      const maxX = Math.max(0, (img.offsetWidth * s - stage.clientWidth) / 2);
      const maxY = Math.max(0, (img.offsetHeight * s - stage.clientHeight) / 2);
      o = { x: clamp(o.x, -maxX, maxX), y: clamp(o.y, -maxY, maxY) };
    }
    scaleRef.current = s;
    offsetRef.current = o;
    setScale(s);
    setOffset(o);
  }, []);

  /** Zooms so that the stage point `at` (relative to the stage centre) stays put. */
  const zoomAround = useCallback(
    (nextScale: number, at: Point) => {
      const s1 = scaleRef.current;
      const s2 = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      const o1 = offsetRef.current;
      const ratio = s2 / s1;
      applyTransform(s2, {
        x: at.x - (at.x - o1.x) * ratio,
        y: at.y - (at.y - o1.y) * ratio,
      });
    },
    [applyTransform]
  );

  const stagePoint = (clientX: number, clientY: number): Point => {
    const stage = stageRef.current;
    if (!stage) return { x: 0, y: 0 };
    const rect = stage.getBoundingClientRect();
    return {
      x: clientX - (rect.left + rect.width / 2),
      y: clientY - (rect.top + rect.height / 2),
    };
  };

  /**
   * Closing goes through the history entry this viewer pushed on open
   * (below), so that Back and every other way of closing end up in
   * exactly the same state - one entry, not a stale one left behind
   * that would make the next Back press do nothing visible.
   */
  const requestClose = useCallback(() => {
    let viaHistory = false;
    try {
      viaHistory = Boolean(window.history.state?.[HISTORY_KEY]);
      if (viaHistory) window.history.back();
    } catch {
      viaHistory = false;
    }
    if (!viaHistory) onCloseRef.current();
  }, []);

  // Back button / swipe-back: while the viewer is open, one history
  // entry marks it, and a popstate (the entry being left) closes it
  // instead of leaving the page underneath. The push is guarded so a
  // re-run (React StrictMode's double effect in development) never
  // stacks two entries.
  useEffect(() => {
    if (!src) return;

    try {
      if (!window.history.state?.[HISTORY_KEY]) {
        window.history.pushState({ [HISTORY_KEY]: true }, "");
      }
    } catch {
      // History unavailable (e.g. a sandboxed frame) - Escape/click
      // still close; only the Back-button affordance is lost.
    }

    const handlePopState = () => onCloseRef.current();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [src]);

  // Focus: land on the close button when opening (the dialog's first
  // control), give focus back to whatever opened us on close, and keep
  // Tab inside the dialog while it is open.
  useEffect(() => {
    if (!src) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => {
      const opener = openerRef.current;
      if (opener && typeof opener.focus === "function" && document.contains(opener)) {
        opener.focus();
      }
    };
  }, [src]);

  useEffect(() => {
    if (!src) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case "Escape":
          event.preventDefault();
          requestClose();
          return;
        case "+":
        case "=":
          event.preventDefault();
          zoomAround(scaleRef.current * 1.5, { x: 0, y: 0 });
          return;
        case "-":
        case "_":
          event.preventDefault();
          zoomAround(scaleRef.current / 1.5, { x: 0, y: 0 });
          return;
        case "0":
          event.preventDefault();
          applyTransform(1, { x: 0, y: 0 });
          return;
        case "ArrowLeft":
        case "ArrowRight":
        case "ArrowUp":
        case "ArrowDown": {
          if (scaleRef.current === 1) return;
          event.preventDefault();
          const step = 40;
          const o = offsetRef.current;
          const d: Point =
            event.key === "ArrowLeft"
              ? { x: step, y: 0 }
              : event.key === "ArrowRight"
                ? { x: -step, y: 0 }
                : event.key === "ArrowUp"
                  ? { x: 0, y: step }
                  : { x: 0, y: -step };
          applyTransform(scaleRef.current, { x: o.x + d.x, y: o.y + d.y });
          return;
        }
        case "Tab": {
          const root = stageRef.current?.parentElement;
          if (!root) return;
          const focusable = Array.from(
            root.querySelectorAll<HTMLElement>("button:not([disabled])")
          );
          if (focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          const active = document.activeElement;
          if (event.shiftKey && (active === first || !root.contains(active))) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && (active === last || !root.contains(active))) {
            event.preventDefault();
            first.focus();
          }
          return;
        }
        default:
          return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [src, requestClose, zoomAround, applyTransform]);

  // Wheel / trackpad zoom. Registered natively (not via React's
  // onWheel) because React attaches wheel listeners as passive, and a
  // passive listener cannot preventDefault - the page (or the browser's
  // own pinch-zoom, which arrives as a ctrlKey wheel) would zoom along
  // with the image.
  useEffect(() => {
    if (!src) return;
    const stage = stageRef.current;
    if (!stage) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.002));
      zoomAround(scaleRef.current * factor, stagePoint(event.clientX, event.clientY));
    };

    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => stage.removeEventListener("wheel", handleWheel);
  }, [src, zoomAround]);

  if (!src || typeof document === "undefined") return null;

  // A click only closes when it lands directly on the backdrop element
  // itself (event.target === event.currentTarget), never when it
  // bubbles up from a descendant (the image, the loading/error state,
  // the close button). This is the standard, bulletproof backdrop-
  // click pattern - it does not depend on every descendant remembering
  // to stopPropagation, or on the content wrapper's box happening to
  // leave a real gap around it. An earlier version of this component
  // relied on the latter (mirroring PostCard's own lightbox) and a
  // manual click-target check during review found it unreliable here:
  // the content wrapper's own sizing left far less real backdrop margin
  // than intended, at only sm:p-6 (24px) around most of its edge.
  // A click that ends a drag/pinch is not a "close" either.
  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (drag.current?.moved) return;
    if (event.target === event.currentTarget) requestClose();
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    // The buttons (close, zoom) handle their own clicks; capturing the
    // pointer for them would retarget their click to the stage.
    if ((event.target as HTMLElement).closest("button")) return;
    const stage = stageRef.current;
    if (!stage) return;
    stage.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      pinch.current = { startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1, startScale: scaleRef.current };
      drag.current = null;
    } else if (pointers.current.size === 1) {
      drag.current = { last: { x: event.clientX, y: event.clientY }, moved: false };
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const centre = stagePoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      zoomAround(pinch.current.startScale * (dist / pinch.current.startDist), centre);
      return;
    }

    const d = drag.current;
    if (!d || pointers.current.size !== 1) return;
    const dx = event.clientX - d.last.x;
    const dy = event.clientY - d.last.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_SLOP_PX) return;
    d.moved = true;
    d.last = { x: event.clientX, y: event.clientY };
    if (scaleRef.current > 1) {
      const o = offsetRef.current;
      applyTransform(scaleRef.current, { x: o.x + dx, y: o.y + dy });
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (stage?.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    pointers.current.delete(event.pointerId);

    if (pointers.current.size < 2) pinch.current = null;

    const d = drag.current;
    if (pointers.current.size === 0) {
      // Double-tap / double-click on the image toggles between 1:1 and
      // a zoomed view around the tapped point. (dblclick alone is not
      // reliable for touch, so this is detected by hand.)
      const tappedImage = event.target === imgRef.current;
      const now = Date.now();
      const point = { x: event.clientX, y: event.clientY };
      if (d && !d.moved && tappedImage) {
        const previous = lastTap.current;
        if (
          previous &&
          now - previous.at < DOUBLE_TAP_MS &&
          Math.hypot(point.x - previous.point.x, point.y - previous.point.y) < DOUBLE_TAP_SLOP_PX
        ) {
          lastTap.current = null;
          if (scaleRef.current > 1) applyTransform(1, { x: 0, y: 0 });
          else zoomAround(DOUBLE_TAP_SCALE, stagePoint(point.x, point.y));
        } else {
          lastTap.current = { at: now, point };
        }
      }
      // Leaves `moved` readable by the click that follows this pointerup
      // (so a drag never registers as a backdrop click), then clears it.
      if (d?.moved) setTimeout(() => { drag.current = null; }, 0);
      else drag.current = null;
    }
  };

  const zoomed = scale > 1;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={handleBackdropClick}
    >
      <div
        ref={stageRef}
        className={`relative flex h-full max-h-[92dvh] w-full max-w-3xl touch-none select-none items-center justify-center overflow-hidden ${
          zoomed ? "cursor-grab active:cursor-grabbing" : ""
        }`}
        onClick={handleBackdropClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {status === "loading" && (
          <Loader2 className="h-10 w-10 animate-spin text-white/80" aria-hidden="true" />
        )}

        {status === "error" && (
          <p role="alert" className="rounded-lg bg-black/40 px-4 py-3 text-sm text-white/90">
            {t("explore.errFailedLoad")}
          </p>
        )}

        <img
          ref={imgRef}
          src={src}
          alt={alt}
          draggable={false}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: "center center",
          }}
          className={`max-h-full max-w-full select-none rounded-sm object-contain will-change-transform ${
            status === "loaded" ? "" : "hidden"
          }`}
        />

        <button
          ref={closeButtonRef}
          type="button"
          onClick={requestClose}
          aria-label={t("post.closeImageAria")}
          className="absolute end-1 top-1 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80 sm:end-2 sm:top-2"
        >
          <X className="h-6 w-6" />
        </button>

        {status === "loaded" && (
          <div className="absolute bottom-1 end-1 flex items-center gap-1 sm:bottom-2 sm:end-2">
            <button
              type="button"
              onClick={() => zoomAround(scale / 1.5, { x: 0, y: 0 })}
              disabled={scale <= MIN_SCALE}
              aria-label={t("ambassadors.map.zoomOut")}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ZoomOut className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => zoomAround(scale * 1.5, { x: 0, y: 0 })}
              disabled={scale >= MAX_SCALE}
              aria-label={t("ambassadors.map.zoomIn")}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ZoomIn className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
