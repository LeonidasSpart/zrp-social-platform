"use client";

import { useEffect } from "react";

/*
 * A small in-app confirmation dialog, for destructive actions that
 * previously relied on window.confirm().
 *
 * window.confirm()/alert() are unreliable across ZRP's real deployment
 * surfaces: iOS Safari in standalone/home-screen (PWA) display mode does
 * not reliably show them, and embedded in-app browsers (Telegram,
 * WhatsApp, Instagram) commonly suppress them outright - the call
 * returns immediately without ever prompting the user, so any
 * `if (!confirm(...)) return;` gate silently blocks the action forever.
 * This component has no such dependency: it is ordinary React UI.
 */
interface ConfirmModalProps {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive,
  busy,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
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
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-body"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-zrp-charcoal"
      >
        <h2
          id="confirm-modal-title"
          className="font-orbitron text-base font-bold text-gray-900 dark:text-white"
        >
          {title}
        </h2>
        <p id="confirm-modal-body" className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {body}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-full px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-full px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60 ${
              destructive ? "bg-zrp-red hover:bg-zrp-darkRed" : "bg-gray-900 hover:bg-gray-800"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
