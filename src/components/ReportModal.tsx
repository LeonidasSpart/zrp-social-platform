"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reason: string, details?: string) => void;
}

export default function ReportModal({ isOpen, onClose, onSubmit }: ReportModalProps) {
  const { t } = useLanguage();
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  // The submitted `reason` must stay this fixed English value - the
  // moderation-transparency dashboard aggregates reports by matching
  // this exact string (see transparency.page.tsx's REASON_KEY_MAP and
  // the "Other" fallback in /api/transparency/moderation). Only the
  // displayed label is translated, via the very same transparency.reason*
  // keys already shown there, so a report filed here and a report
  // tallied there always describe themselves the same way.
  const reasons: { value: string; label: string }[] = [
    { value: "Spam", label: t("transparency.reasonSpam") },
    { value: "Harassment or bullying", label: t("transparency.reasonHarassment") },
    { value: "Inappropriate content", label: t("transparency.reasonInappropriate") },
    { value: "Misinformation", label: t("transparency.reasonMisinformation") },
    { value: "Hate speech", label: t("transparency.reasonHateSpeech") },
    { value: "Impersonation", label: t("transparency.reasonImpersonation") },
    { value: "Other", label: t("transparency.reasonOther") },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) return;
    setLoading(true);
    onSubmit(reason, details);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t("report.modalTitle")}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("report.reasonLabel")}
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">{t("report.selectReasonPlaceholder")}</option>
                {reasons.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("report.detailsLabel")}
              </label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder={t("report.detailsPlaceholder")}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 py-2 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition"
              >
                {t("action.cancel")}
              </button>
              <button
                type="submit"
                disabled={!reason || loading}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {loading ? t("report.submitting") : t("report.submit")}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
