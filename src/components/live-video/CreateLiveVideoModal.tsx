"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { localizeApiMessage } from "@/lib/api-error-i18n";

interface MyCommunity {
  id: string;
  name: string;
}

type Visibility = "PUBLIC" | "COMMUNITY" | "PRIVATE";

interface CreateLiveVideoModalProps {
  onClose: () => void;
  onCreated: (roomId: string) => void;
}

/**
 * Direct structural mirror of CreateLiveAudioModal.tsx - see its own
 * doc comment for why there's no "schedule for later" UI here either.
 * Generic form labels (title/description/category/visibility/
 * community) reuse the liveAudio.* translation keys rather than
 * duplicating identical English-and-every-other-language text under a
 * new liveVideo.* key - the copy itself ("Title", "Who can join",
 * "Public"/"Community"/"Private"...) has nothing audio-specific about
 * it.
 */
export default function CreateLiveVideoModal({ onClose, onCreated }: CreateLiveVideoModalProps) {
  const { t } = useLanguage();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("PUBLIC");
  const [communityId, setCommunityId] = useState("");
  const [myCommunities, setMyCommunities] = useState<MyCommunity[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visibility !== "COMMUNITY" || myCommunities !== null) return;
    fetch("/api/communities?mine=true&limit=100")
      .then((res) => res.json())
      .then((data) => setMyCommunities(Array.isArray(data.items) ? data.items : []))
      .catch(() => setMyCommunities([]));
  }, [visibility, myCommunities]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, submitting]);

  const canSubmit =
    title.trim().length > 0 &&
    title.trim().length <= 200 &&
    !submitting &&
    (visibility !== "COMMUNITY" || !!communityId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/live-video/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          category: category.trim() || undefined,
          visibility,
          communityId: visibility === "COMMUNITY" ? communityId : undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(localizeApiMessage(data?.error, t) || t("liveAudio.createError"));
        setSubmitting(false);
        return;
      }
      onCreated(data.room.id);
    } catch {
      setError(t("liveAudio.createError"));
      setSubmitting(false);
    }
  };

  const visibilityOptions: { value: Visibility; label: string }[] = [
    { value: "PUBLIC", label: t("liveAudio.visibilityPublic") },
    { value: "COMMUNITY", label: t("liveAudio.visibilityCommunity") },
    { value: "PRIVATE", label: t("liveAudio.visibilityPrivate") },
  ];

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/60 flex items-end sm:items-center sm:justify-center"
      onClick={() => !submitting && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-live-video-title"
    >
      <div
        className="w-full sm:w-[440px] sm:max-h-[85vh] bg-white dark:bg-zrp-deepBlack rounded-t-2xl sm:rounded-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 id="create-live-video-title" className="font-orbitron text-lg font-bold text-gray-900 dark:text-white">
            {t("liveAudio.createTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label={t("action.cancel")}
            className="p-1.5 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {error && (
            <p role="alert" aria-live="polite" className="text-sm text-zrp-red">
              {error}
            </p>
          )}

          <div>
            <label htmlFor="live-video-title" className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
              {t("liveAudio.titleLabel")}
            </label>
            <input
              id="live-video-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("liveAudio.titlePlaceholder")}
              maxLength={200}
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-zrp-charcoal text-gray-900 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-zrp-red"
            />
            {!title.trim() && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("liveAudio.titleRequired")}</p>
            )}
          </div>

          <div>
            <label htmlFor="live-video-description" className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
              {t("liveAudio.descriptionLabel")}
            </label>
            <textarea
              id="live-video-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={2}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-zrp-charcoal text-gray-900 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-zrp-red resize-none"
            />
          </div>

          <div>
            <label htmlFor="live-video-category" className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
              {t("liveAudio.categoryLabel")}
            </label>
            <input
              id="live-video-category"
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              maxLength={60}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-zrp-charcoal text-gray-900 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-zrp-red"
            />
          </div>

          <fieldset>
            <legend className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
              {t("liveAudio.visibilityLabel")}
            </legend>
            <div className="flex gap-2">
              {visibilityOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setVisibility(opt.value)}
                  aria-pressed={visibility === opt.value}
                  className={`flex-1 px-3 py-2 rounded-xl text-sm font-semibold border transition ${
                    visibility === opt.value
                      ? "bg-zrp-red text-white border-zrp-red"
                      : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-zrp-red"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </fieldset>

          {visibility === "COMMUNITY" && (
            <div>
              <label htmlFor="live-video-community" className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
                {t("liveAudio.communityLabel")}
              </label>
              {myCommunities === null ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t("action.loading")}
                </div>
              ) : myCommunities.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">{t("liveAudio.noCommunitiesHint")}</p>
              ) : (
                <select
                  id="live-video-community"
                  value={communityId}
                  onChange={(e) => setCommunityId(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-zrp-charcoal text-gray-900 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-zrp-red"
                >
                  <option value="" disabled>
                    {t("liveAudio.selectCommunityPlaceholder")}
                  </option>
                  {myCommunities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-full px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              {t("action.cancel")}
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold text-white bg-zrp-red hover:bg-zrp-darkRed transition disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("liveAudio.createSubmit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
