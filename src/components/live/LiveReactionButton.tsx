"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Heart } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { liveRequest, liveRoomBase, LiveApiError, type LiveRoomType } from "./live-api";
import { useLiveSocketEvent } from "./useLiveSocketEvent";
import styles from "./live.module.css";

// Server caps one request at 20 taps (MAX_TAPS_PER_REQUEST in
// reaction-service.ts); flush early at that size rather than send a
// count the server would silently truncate.
const MAX_BATCH = 20;
const FLUSH_DELAY_MS = 450;
// Visual caps: a big burst renders a handful of hearts, never `count`
// DOM nodes - the real aggregate is shown as a number instead.
const MAX_HEARTS_PER_BURST = 5;
const MAX_HEARTS_ON_SCREEN = 14;

interface FloatingHeart {
  id: number;
  drift: number;
}

export default function LiveReactionButton({
  roomType,
  roomId,
  myUserId,
  initialCount,
}: {
  roomType: LiveRoomType;
  roomId: string;
  myUserId: string | undefined;
  initialCount: number;
}) {
  const { t, language } = useLanguage();
  const tRef = useRef(t);
  tRef.current = t;

  const [count, setCount] = useState(initialCount);
  const [hearts, setHearts] = useState<FloatingHeart[]>([]);
  const pendingRef = useRef(0);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const cooldownUntilRef = useRef(0);
  const heartIdRef = useRef(0);

  const spawnHearts = useCallback((n: number) => {
    const toAdd = Math.min(n, MAX_HEARTS_PER_BURST);
    setHearts((prev) => {
      const next = [...prev];
      for (let i = 0; i < toAdd; i++) {
        heartIdRef.current += 1;
        next.push({ id: heartIdRef.current, drift: Math.round((Math.random() - 0.5) * 56) });
      }
      return next.slice(-MAX_HEARTS_ON_SCREEN);
    });
  }, []);

  // Only ever move the displayed total forward: responses and socket
  // broadcasts can arrive out of order, and the counter only increments.
  const applyServerCount = useCallback((n: number) => {
    if (typeof n === "number" && Number.isFinite(n)) setCount((prev) => Math.max(prev, n));
  }, []);

  // The room page re-reads its detail on participant changes; a newer
  // server total arriving that way moves the counter forward too.
  useEffect(() => applyServerCount(initialCount), [initialCount, applyServerCount]);

  const flush = useCallback(async () => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (inFlightRef.current || pendingRef.current === 0) return;
    const batch = Math.min(pendingRef.current, MAX_BATCH);
    pendingRef.current -= batch;
    inFlightRef.current = true;
    try {
      const data = await liveRequest<{ roomReactionCount: number }>(`${liveRoomBase(roomType, roomId)}/reactions`, tRef.current, {
        method: "POST",
        body: { count: batch },
      });
      applyServerCount(data.roomReactionCount);
    } catch (err) {
      // Reactions are a casual action: no error toast for anything.
      // On rate_limited, drop what's queued and stay quiet until the
      // server's window has passed.
      pendingRef.current = 0;
      if (err instanceof LiveApiError && err.code === "rate_limited") {
        cooldownUntilRef.current = Date.now() + (err.retryAfter ?? 10) * 1000;
      }
    } finally {
      inFlightRef.current = false;
      if (pendingRef.current > 0) flushTimerRef.current = setTimeout(() => void flush(), FLUSH_DELAY_MS);
    }
  }, [roomType, roomId, applyServerCount]);

  useEffect(
    () => () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    },
    []
  );

  const onTap = () => {
    if (Date.now() < cooldownUntilRef.current) return;
    spawnHearts(1);
    pendingRef.current += 1;
    if (pendingRef.current >= MAX_BATCH) {
      void flush();
      return;
    }
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => void flush(), FLUSH_DELAY_MS);
  };

  useLiveSocketEvent<{ userId: string; count: number; roomReactionCount: number }>(myUserId, "live-reaction:tap", (payload) => {
    applyServerCount(payload.roomReactionCount);
    // My own taps already animated locally as they happened.
    if (payload.userId !== myUserId) spawnHearts(payload.count);
  });

  const formatted = new Intl.NumberFormat(language, { notation: "compact", maximumFractionDigits: 1 }).format(count);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onTap}
        className="inline-flex items-center gap-1.5 min-h-11 px-3 rounded-full bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white font-semibold text-sm hover:bg-gray-200 dark:hover:bg-white/20 active:scale-95 transition"
      >
        <Heart className="w-5 h-5 text-zrp-red" fill="currentColor" aria-hidden="true" />
        <span className="sr-only">{t("action.like")}</span>
        <span className="tabular-nums">{formatted}</span>
      </button>
      <div aria-hidden="true">
        {hearts.map((h) => (
          <Heart
            key={h.id}
            className={`${styles.heart} w-5 h-5 text-zrp-red`}
            fill="currentColor"
            style={{ ["--drift" as string]: `${h.drift}px` }}
            onAnimationEnd={() => setHearts((prev) => prev.filter((x) => x.id !== h.id))}
          />
        ))}
      </div>
    </div>
  );
}
