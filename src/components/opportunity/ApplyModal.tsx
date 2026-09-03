"use client";

import { useState } from "react";
import { X, Paperclip, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUploadThing } from "@/lib/uploadthing-client";

interface ApplyModalProps {
  listingId: string;
  onClose: () => void;
  onApplied: () => void;
}

export default function ApplyModal({ listingId, onClose, onApplied }: ApplyModalProps) {
  const { t } = useLanguage();
  const [coverNote, setCoverNote] = useState("");
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [resumeName, setResumeName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { startUpload } = useUploadThing("chatFile", {
    onClientUploadComplete: (files) => {
      setUploading(false);
      if (files?.length) {
        setResumeUrl(files[0].ufsUrl);
        setResumeName(files[0].name);
      }
    },
    onUploadError: (err) => {
      setUploading(false);
      setError(err.message || t("opportunity.errResumeUploadFailed"));
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    startUpload([file]);
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/opportunity/${listingId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverNote: coverNote.trim() || undefined, resumeUrl: resumeUrl || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to apply");
      onApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("opportunity.errApplyFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-zrp-deepBlack p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t("opportunity.applyTitle")}</h2>
          <button type="button" onClick={onClose} aria-label={t("opportunity.close")}>
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              {t("opportunity.coverNoteLabel")}
            </label>
            <textarea
              value={coverNote}
              onChange={(e) => setCoverNote(e.target.value)}
              placeholder={t("opportunity.coverNotePlaceholder")}
              rows={4}
              maxLength={3000}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              {t("opportunity.resumeLabel")}
            </label>
            {resumeUrl ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">
                <Paperclip className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{resumeName}</span>
              </div>
            ) : (
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400 cursor-pointer hover:border-zrp-red transition">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                {uploading ? t("opportunity.uploading") : t("opportunity.attachResume")}
                {/* No accept restriction, deliberately - a cloud storage
                    app's own file picker (MEGA, Google Drive, Dropbox)
                    frequently doesn't tag a resume with any of the MIME
                    types this would filter on, and both Android's and
                    iOS's system pickers grey out/hide files that don't
                    match an accept filter before this code ever runs.
                    The server (chatFile's pdf/text/blob categories)
                    already accepts whatever comes through. */}
                <input type="file" className="hidden" onChange={handleFileChange} disabled={uploading} />
              </label>
            )}
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="button"
            disabled={submitting || uploading}
            onClick={submit}
            className="px-5 py-2.5 rounded-full bg-zrp-red text-white font-semibold hover:bg-red-600 transition disabled:opacity-50"
          >
            {submitting ? t("opportunity.submitting") : t("opportunity.submitApplication")}
          </button>
        </div>
      </div>
    </div>
  );
}
