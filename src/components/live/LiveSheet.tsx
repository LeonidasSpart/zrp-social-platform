"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * Non-modal overlay panel shared by the Live gift, chat and replay
 * panels: a bottom sheet on phones, a floating side panel from `md` up.
 * The room behind it stays live and interactive (it's not a modal), so
 * there's no focus trap - but Escape closes it and focus returns to the
 * control that opened it.
 *
 * Portaled to <body> for the same reason BottomNav is: the room pages'
 * own fixed action bar uses backdrop-blur, and a backdrop-filter
 * ancestor becomes the containing block for position: fixed children.
 */
export default function LiveSheet({
  open,
  title,
  onClose,
  headerExtra,
  children,
  footer,
  /** Hidden-but-mounted keeps state (e.g. a chat scroll position) between openings. */
  keepMounted = false,
  /** "fill": fixed height and a non-scrolling body, for content (chat) that manages its own scroller. */
  variant = "auto",
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  headerExtra?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  keepMounted?: boolean;
  variant?: "auto" | "fill";
}) {
  const { t } = useLanguage();
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const openerRef = useRef<Element | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const opener = openerRef.current;
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
  }, [open]);

  if (!mounted || (!open && !keepMounted)) return null;

  return createPortal(
    <section
      ref={panelRef}
      tabIndex={-1}
      aria-labelledby={titleId}
      hidden={!open}
      className={`${open ? "flex" : "hidden"} fixed z-[10000] inset-x-0 bottom-0 flex-col rounded-t-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-zrp-charcoal shadow-2xl pb-[env(safe-area-inset-bottom)] focus:outline-none md:inset-x-auto md:end-4 md:bottom-4 md:w-96 md:rounded-2xl md:pb-0 ${
        variant === "fill" ? "h-[75dvh] md:h-[min(36rem,80dvh)]" : "max-h-[75dvh] md:max-h-[min(36rem,80dvh)]"
      }`}
    >
      <header className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <h2 id={titleId} className="flex-1 min-w-0 truncate text-base font-bold text-gray-900 dark:text-white">
          {title}
        </h2>
        {headerExtra}
        <button
          type="button"
          onClick={onClose}
          aria-label={t("sharePost.close")}
          className="shrink-0 inline-flex items-center justify-center w-11 h-11 -me-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
      </header>
      <div className={`flex-1 min-h-0 ${variant === "fill" ? "flex flex-col" : "overflow-y-auto overscroll-contain"}`}>{children}</div>
      {footer && <div className="border-t border-gray-200 dark:border-gray-800">{footer}</div>}
    </section>,
    document.body
  );
}
