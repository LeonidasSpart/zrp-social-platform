"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface SendAnnouncementModalProps {
  title: string;
  body: string;
  recipientCount: number | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The one safety gate before an irreversible, platform-wide broadcast
 * actually starts (mission requirement: a confirmation dialog showing
 * title/message preview/recipient count/warning, with a strongly
 * destructive-styled confirm action). Built as its own component
 * rather than reusing the generic ConfirmModal
 * (src/components/ConfirmModal.tsx) because that one only accepts a
 * single plain-string body - this needs richer content (the live
 * title/message preview plus a recipient count) while keeping the same
 * a11y contract (role="alertdialog", Escape-to-close, backdrop click to
 * cancel) that component already established.
 */
export default function SendAnnouncementModal({
  title,
  body,
  recipientCount,
  busy,
  onConfirm,
  onCancel,
}: SendAnnouncementModalProps) {
  const { t } = useLanguage();
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel, busy]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={() => !busy && onCancel()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="send-announcement-title"
        aria-describedby="send-announcement-body"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-zrp-charcoal"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-zrp-red/10 text-zrp-red">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 id="send-announcement-title" className="font-orbitron text-base font-bold text-gray-900 dark:text-white">
              {t("adminAnnouncements.sendConfirmTitle")}
            </h2>
          </div>
        </div>

        <div
          id="send-announcement-body"
          className="mt-4 space-y-3 rounded-xl bg-gray-50 p-3 dark:bg-gray-900/40"
        >
          <div>
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{title}</p>
            <p className="mt-0.5 line-clamp-2 text-sm text-gray-600 dark:text-gray-300">{body}</p>
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
            {recipientCount !== null
              ? t("adminAnnouncements.sendConfirmRecipients", { count: recipientCount })
              : t("adminAnnouncements.sendConfirmUnknownRecipients")}
          </p>
        </div>

        <p className="mt-3 text-sm text-zrp-red" role="alert">
          {t("adminAnnouncements.sendConfirmWarning")}
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-full px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            {t("action.cancel")}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy}
            className="inline-flex items-center gap-1.5 rounded-full bg-zrp-red px-4 py-2 text-sm font-semibold text-white transition hover:bg-zrp-darkRed disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {busy ? t("adminAnnouncements.sending") : t("adminAnnouncements.sendConfirmButton")}
          </button>
        </div>
      </div>
    </div>
  );
}
