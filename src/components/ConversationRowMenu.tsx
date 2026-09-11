"use client";

import { useState } from "react";
import { MoreVertical, Trash2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import ConfirmModal from "@/components/ConfirmModal";

interface ConversationRowMenuProps {
  /** Used only in the confirm dialog's aria-describedby text via t(). */
  partnerName: string;
  onDelete: () => Promise<{ success: boolean; error?: string }>;
  className?: string;
}

/**
 * The conversation-list row's own action menu - reachable from the list
 * itself, without opening the conversation first (the real UX gap this
 * fixes: until now "Delete conversation" only existed inside an open
 * thread, via ChatContactDrawer's "..." menu). Deliberately a single
 * action, not an Instagram-style Preview/Pin/Delete/Mute set: ZRP has no
 * conversation-pin or conversation-mute feature anywhere in the product
 * (only per-user Mute, a different thing, surfaced elsewhere), so adding
 * those here would be exactly the fake-functionality this app's design
 * rules forbid. A plain, always-visible icon button rather than a swipe
 * gesture - discoverable at a glance and works identically with mouse,
 * touch or keyboard, which matters for ZRP's senior-friendly requirement.
 *
 * Reuses the same in-app ConfirmModal (never window.confirm/alert - see
 * ConfirmModal's own KDoc on why those are unreliable in iOS PWA/in-app
 * browsers) and the same real DELETE endpoint via the caller-supplied
 * onDelete (useConversationList's deleteConversation), so list-level
 * deletion and in-thread deletion share one server call and one realtime
 * relay rather than two parallel implementations.
 */
export default function ConversationRowMenu({ partnerName, onDelete, className }: ConversationRowMenuProps) {
  const { t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setBusy(true);
    const result = await onDelete();
    setBusy(false);
    setConfirming(false);
    if (!result.success) {
      setError(result.error || t("messages.errDeleteFailed"));
      window.setTimeout(() => setError(null), 4000);
    }
  };

  return (
    // Stops the click from bubbling up into the row's own <Link>, which
    // would otherwise navigate into the conversation instead of opening
    // this menu.
    <div
      className={`relative flex-shrink-0 ${className ?? ""}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-label={t("chat.contactMore")}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className="p-2 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition"
      >
        <MoreVertical className="w-5 h-5" />
      </button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 z-50 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                setError(null);
                setConfirming(true);
              }}
              className="flex w-full items-center gap-2.5 px-4 py-3 text-sm font-medium text-red-600 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <Trash2 className="w-4 h-4" />
              {t("messages.deleteConversation")}
            </button>
          </div>
        </>
      )}

      {confirming && (
        <ConfirmModal
          title={t("messages.deleteConversation")}
          body={t("messages.deleteConfirm")}
          confirmLabel={t("action.delete")}
          cancelLabel={t("action.cancel")}
          destructive
          busy={busy}
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(false)}
        />
      )}

      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="fixed bottom-20 left-1/2 z-[120] -translate-x-1/2 rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-lg"
        >
          {error}
        </div>
      )}
    </div>
  );
}
