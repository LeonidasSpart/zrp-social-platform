"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleDot, Film, Loader2, Square } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TranslationKey } from "@/lib/translations";
import { useLiveSocketEvent } from "./useLiveSocketEvent";
import { liveErrorMessage, liveRequest, liveRoomBase, LiveApiError, type LiveRoomType } from "./live-api";

interface Recording {
  id: string;
  mediaUrl: string | null;
  durationSeconds: number | null;
  startedAt: string;
  endedAt: string | null;
}

const ERROR_KEYS: Record<string, TranslationKey> = {
  replay_not_configured: "liveReplay.notConfigured",
};

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/**
 * Completed recordings of this room (only ever rows the LiveKit
 * `egress_ended` webhook marked EGRESS_COMPLETE with a real mediaUrl),
 * plus host/moderator start/stop. Starting is wired to the real
 * endpoint; while this deployment has no Egress storage bucket the
 * server answers 503 replay_not_configured, which is shown as exactly
 * that - the control stays, and nothing pretends a recording started.
 */
export default function LiveReplayControls({
  roomType,
  roomId,
  myUserId,
  canControl,
  isLive,
}: {
  roomType: LiveRoomType;
  roomId: string;
  myUserId: string | undefined;
  /** HOST or MODERATOR - the server re-checks this on every start/stop. */
  canControl: boolean;
  isLive: boolean;
}) {
  const { t, language } = useLanguage();
  const tRef = useRef(t);
  tRef.current = t;
  const base = liveRoomBase(roomType, roomId);

  const [recordings, setRecordings] = useState<Recording[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  // Only ever true after the server confirmed a start (response,
  // `already_recording`, or the room-wide recording-started event).
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [controlMessage, setControlMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setListError(null);
    try {
      const data = await liveRequest<{ recordings: Recording[] }>(`${base}/replay`, tRef.current);
      setRecordings(data.recordings ?? []);
    } catch (err) {
      setListError(liveErrorMessage(err, tRef.current));
      setRecordings([]);
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveSocketEvent<{ recordingId: string }>(myUserId, "live-replay:recording-started", () => {
    setRecording(true);
    setControlMessage(null);
  });

  const start = async () => {
    setBusy(true);
    setControlMessage(null);
    try {
      await liveRequest(`${base}/replay/start`, tRef.current, { method: "POST" });
      setRecording(true);
    } catch (err) {
      if (err instanceof LiveApiError && err.code === "already_recording") {
        setRecording(true);
      } else {
        setControlMessage(liveErrorMessage(err, tRef.current, ERROR_KEYS));
      }
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    setControlMessage(null);
    try {
      await liveRequest(`${base}/replay/stop`, tRef.current, { method: "POST" });
      setRecording(false);
    } catch (err) {
      if (err instanceof LiveApiError && err.code === "not_recording") {
        setRecording(false);
      } else {
        setControlMessage(liveErrorMessage(err, tRef.current, ERROR_KEYS));
      }
    } finally {
      setBusy(false);
    }
  };

  const dateFormat = new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" });

  return (
    <section aria-labelledby={`replays-${roomId}`} className="mt-8">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h2 id={`replays-${roomId}`} className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {t("liveReplay.title")}
        </h2>
        {canControl && isLive && (
          <button
            type="button"
            onClick={() => void (recording ? stop() : start())}
            disabled={busy}
            aria-busy={busy}
            className={`inline-flex items-center gap-1.5 min-h-11 px-4 rounded-full text-sm font-semibold transition disabled:opacity-50 ${
              recording
                ? "bg-zrp-red text-white hover:bg-zrp-darkRed"
                : "border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-white/10"
            }`}
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : recording ? (
              <Square className="w-4 h-4" fill="currentColor" aria-hidden="true" />
            ) : (
              <CircleDot className="w-4 h-4 text-zrp-red" aria-hidden="true" />
            )}
            {recording ? t("liveReplay.stop") : t("liveReplay.start")}
          </button>
        )}
      </div>

      {controlMessage && (
        <p role="alert" aria-live="polite" className="mb-3 text-sm text-gray-700 dark:text-gray-200 rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-2">
          {controlMessage}
        </p>
      )}

      {recordings === null ? (
        <div className="h-14 rounded-xl bg-gray-100 dark:bg-white/5 animate-pulse" aria-busy="true" />
      ) : listError ? (
        <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
          <p role="alert">{listError}</p>
          <button type="button" onClick={() => void load()} className="min-h-11 px-2 font-semibold text-zrp-red hover:underline">
            {t("action.retry")}
          </button>
        </div>
      ) : recordings.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Film className="w-4 h-4 shrink-0" aria-hidden="true" />
          {t("liveReplay.empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {recordings.map((r) => {
            const label = dateFormat.format(new Date(r.startedAt));
            return (
              <li key={r.id} className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                <p className="flex items-center justify-between gap-2 text-sm mb-2">
                  <time dateTime={r.startedAt} className="font-medium text-gray-900 dark:text-white">
                    {label}
                  </time>
                  {r.durationSeconds !== null && (
                    <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">{formatDuration(r.durationSeconds)}</span>
                  )}
                </p>
                {r.mediaUrl &&
                  (roomType === "VIDEO" ? (
                    <video src={r.mediaUrl} controls preload="metadata" playsInline aria-label={label} className="w-full rounded-lg bg-black" />
                  ) : (
                    <audio src={r.mediaUrl} controls preload="metadata" aria-label={label} className="w-full" />
                  ))}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
