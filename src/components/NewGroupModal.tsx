"use client";

import { useState } from "react";
import { Loader2, X, Users } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import UserMultiSelect, { type SelectableUser } from "@/components/UserMultiSelect";

// Kept in sync with the real backend minimum in
// src/app/api/conversations/route.ts (MIN_OTHER_PARTICIPANTS) - a
// mismatch here would just mean the submit button unlocks a moment
// before/after the API would actually accept it, but the API's own
// check is what's authoritative regardless of this value.
const MIN_OTHER_PARTICIPANTS = 2;

interface NewGroupModalProps {
  onClose: () => void;
  // Fired with the real created conversation id once POST /api/conversations
  // succeeds, so the caller can navigate to /messages/group/{id} and/or
  // refresh its own conversation list.
  onCreated: (conversationId: string) => void;
}

export default function NewGroupModal({ onClose, onCreated }: NewGroupModalProps) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [members, setMembers] = useState<SelectableUser[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = Math.max(0, MIN_OTHER_PARTICIPANTS - members.length);
  const canSubmit = name.trim().length > 0 && remaining === 0 && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          participantIds: members.map((m) => m.id),
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        // Real backend error text (400 too few members / 403 blocked /
        // 404 unknown user) surfaces directly - the same convention
        // chat.errSendFailed already uses for message-send failures,
        // rather than a generic message that hides which real
        // constraint was actually violated.
        setError(data?.error || t("group.create.errGeneric"));
        setSubmitting(false);
        return;
      }

      onCreated(data.id);
    } catch {
      setError(t("group.create.errGeneric"));
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/60 flex items-end sm:items-center sm:justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-group-title"
    >
      <div
        className="w-full sm:w-[440px] sm:max-h-[85vh] bg-white dark:bg-zrp-deepBlack rounded-t-2xl sm:rounded-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 id="new-group-title" className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-zrp-red" />
            {t("group.create.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label={t("action.cancel")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-4 pb-4 space-y-4">
          {error && (
            <p
              role="alert"
              aria-live="polite"
              className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2"
            >
              {error}
            </p>
          )}

          <div>
            <label htmlFor="new-group-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("group.create.nameLabel")}
            </label>
            <input
              id="new-group-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder={t("group.create.namePlaceholder")}
              disabled={submitting}
              className="
                w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600
                bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white
                placeholder:text-gray-400 outline-none transition
                focus:border-zrp-red focus:ring-2 focus:ring-zrp-red/20
                disabled:opacity-50
              "
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("group.create.membersLabel")}
            </label>
            <UserMultiSelect
              selected={members}
              onChange={setMembers}
              disabled={submitting}
              ariaLabel={t("group.create.membersLabel")}
            />
            {remaining > 0 && (
              <p className="mt-1.5 text-xs text-gray-400">
                {t("group.create.minMembers", { count: remaining })}
              </p>
            )}
            {members.length > 0 && (
              <p className="mt-1.5 text-xs text-gray-400">
                {t("group.create.selectedCount", { count: members.length })}
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 py-2.5 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition disabled:opacity-50"
            >
              {t("action.cancel")}
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              aria-busy={submitting}
              className="flex-1 bg-zrp-red text-white py-2.5 rounded-xl font-medium hover:bg-zrp-darkRed disabled:opacity-50 disabled:cursor-not-allowed transition inline-flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t("group.create.creating")}
                </>
              ) : (
                t("group.create.submit")
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
