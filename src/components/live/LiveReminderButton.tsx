"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellRing, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TranslationKey } from "@/lib/translations";
import { liveErrorMessage, liveRequest, liveRoomBase, type LiveRoomType } from "./live-api";

const ERROR_KEYS: Record<string, TranslationKey> = {
  not_scheduled: "liveReminders.errNotScheduled",
};

/**
 * "Remind me" for a SCHEDULED room. The caller only renders this for a
 * scheduled room the viewer doesn't host (the server rejects both other
 * cases: not_scheduled / cannot_remind_self). The subscriber is notified
 * by the server the moment the host actually starts the room.
 */
export default function LiveReminderButton({
  roomType,
  roomId,
}: {
  roomType: LiveRoomType;
  roomId: string;
}) {
  const { t } = useLanguage();
  const tRef = useRef(t);
  tRef.current = t;
  const url = `${liveRoomBase(roomType, roomId)}/reminder`;

  const [reminded, setReminded] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    liveRequest<{ reminded: boolean }>(url, tRef.current)
      .then((data) => {
        if (!cancelled) setReminded(!!data.reminded);
      })
      .catch((err) => {
        if (!cancelled) {
          setReminded(false);
          setError(liveErrorMessage(err, tRef.current, ERROR_KEYS));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const toggle = async () => {
    if (busy || reminded === null) return;
    setBusy(true);
    setError(null);
    try {
      await liveRequest(url, tRef.current, { method: reminded ? "DELETE" : "POST" });
      setReminded(!reminded);
    } catch (err) {
      // not_scheduled: the room started or ended since this page loaded -
      // the specific message says so; nothing is toggled locally.
      setError(liveErrorMessage(err, tRef.current, ERROR_KEYS));
    } finally {
      setBusy(false);
    }
  };

  const loading = reminded === null;

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy || loading}
        aria-pressed={reminded === true}
        aria-busy={busy || loading}
        className={`inline-flex items-center gap-1.5 min-h-11 px-5 rounded-full font-semibold text-sm transition disabled:opacity-60 ${
          reminded
            ? "border border-zrp-red text-zrp-red hover:bg-zrp-red/10"
            : "bg-zrp-red text-white hover:bg-zrp-darkRed"
        }`}
      >
        {busy || loading ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : reminded ? (
          <BellRing className="w-4 h-4" aria-hidden="true" />
        ) : (
          <Bell className="w-4 h-4" aria-hidden="true" />
        )}
        {reminded ? t("liveReminders.reminderSet") : t("liveReminders.remindMe")}
      </button>
      {error && (
        <p role="alert" aria-live="polite" className="text-sm text-zrp-red text-center">
          {error}
        </p>
      )}
    </div>
  );
}
