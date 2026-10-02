"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Megaphone, Loader2, RefreshCw } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getDateLocale } from "@/lib/dateLocale";
import { localizeApiMessage } from "@/lib/api-error-i18n";
import EmptyState from "@/components/ui/EmptyState";
import AnnouncementPreview from "@/components/admin/AnnouncementPreview";
import type { TranslationKey } from "@/lib/translations";
import {
  ANNOUNCEMENT_TYPES,
  TITLE_MAX_LENGTH,
  BODY_MAX_LENGTH,
  type AnnouncementType,
  validateAnnouncementContent,
} from "@/lib/announcements/types";
import { ANNOUNCEMENT_STATUSES } from "@/lib/announcements/status";

interface Announcement {
  id: string;
  title: string;
  body: string;
  type: string;
  status: string;
  imageUrl: string | null;
  actionUrl: string | null;
  scheduledAt: string | null;
  sendStartedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  totalRecipients: number;
  processedCount: number;
  failedBatchCount: number;
  createdAt: string;
  updatedAt: string;
}

const TYPE_LABEL_KEYS: Record<string, TranslationKey> = {
  ANNOUNCEMENT: "adminAnnouncements.typeAnnouncement",
  UPDATE: "adminAnnouncements.typeUpdate",
  MAINTENANCE: "adminAnnouncements.typeMaintenance",
  SECURITY: "adminAnnouncements.typeSecurity",
  NEW_FEATURE: "adminAnnouncements.typeNewFeature",
};

// Reuses existing generic status words wherever one already exists in
// the dictionary (see the translation-key audit in the PR description)
// instead of inventing a near-duplicate string for every one of the 39
// languages - only PARTIAL has no existing generic equivalent.
const STATUS_LABEL_KEYS: Record<string, TranslationKey> = {
  DRAFT: "ads.status.draft",
  SCHEDULED: "settings.scheduled",
  SENDING: "settings.sending",
  SENT: "adminSubscriptions.sentStatus",
  PARTIAL: "adminAnnouncements.statusPartial",
  FAILED: "adminLaunchpad.statusFailed",
  CANCELLED: "ads.status.cancelled",
};

const STATUS_BADGE_CLASSES: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  SCHEDULED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  SENDING: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  SENT: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  PARTIAL: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  FAILED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  CANCELLED: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

function StatusBadge({ status }: { status: string }) {
  const { t } = useLanguage();
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASSES[status] ?? STATUS_BADGE_CLASSES.DRAFT}`}
    >
      {t(STATUS_LABEL_KEYS[status] ?? "ads.status.draft")}
    </span>
  );
}

export default function AdminAnnouncementsPage() {
  const { t, language } = useLanguage();
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();

  const isFullAdmin = session?.user?.isAdmin || session?.user?.role === "ADMIN";

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<AnnouncementType>("ANNOUNCEMENT");
  const [imageUrl, setImageUrl] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (sessionStatus === "loading") return;
    if (!session || !isFullAdmin) {
      router.push("/admin");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, sessionStatus, isFullAdmin]);

  const fetchAnnouncements = async (status: string) => {
    setLoading(true);
    setLoadError(false);
    try {
      const qs = status === "all" ? "" : `?status=${status}`;
      const res = await fetch(`/api/admin/announcements${qs}`);
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      const data = await res.json();
      setAnnouncements(Array.isArray(data.announcements) ? data.announcements : []);
    } catch (error) {
      console.error("Error fetching announcements:", error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isFullAdmin) fetchAnnouncements(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, isFullAdmin]);

  const resetForm = () => {
    setTitle("");
    setBody("");
    setType("ANNOUNCEMENT");
    setImageUrl("");
    setActionUrl("");
    setScheduledAt("");
    setFormError(null);
  };

  const handleCreate = async () => {
    setFormError(null);

    // Client-side pre-check mirrors src/lib/announcements/types.ts
    // exactly (same constants, same validator) so a well-formed
    // submission essentially never bounces off the server's own
    // validation - this is the real floor, not a second set of rules.
    const precheck = validateAnnouncementContent({
      title,
      body,
      type,
      imageUrl: imageUrl || undefined,
      actionUrl: actionUrl || undefined,
      scheduledAt: scheduledAt || undefined,
    });
    if (!precheck.ok) {
      setFormError(precheck.error);
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body,
          type,
          imageUrl: imageUrl || undefined,
          actionUrl: actionUrl || undefined,
          scheduledAt: scheduledAt || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(localizeApiMessage(data.error, t) || t("auth.errTryAgain"));
        return;
      }
      resetForm();
      setShowCreateForm(false);
      router.push(`/admin/announcements/${data.id}`);
    } catch (error) {
      console.error("Error creating announcement:", error);
      setFormError(t("auth.errTryAgain"));
    } finally {
      setCreating(false);
    }
  };

  if (sessionStatus === "loading" || !session) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zrp-red" aria-hidden="true" />
      </div>
    );
  }

  // Backend authorization (requireAdmin on every /api/admin/announcements/*
  // route) is the real gate; this is the frontend's own mirror of it so a
  // moderator never even sees the page render while the redirect above
  // takes effect - never relied upon as the actual security boundary.
  if (!isFullAdmin) {
    return null;
  }

  const filterTabs = ["all", ...ANNOUNCEMENT_STATUSES];

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
          <Megaphone className="h-5 w-5 text-zrp-red" aria-hidden="true" />
          {t("adminAnnouncements.title")}
        </h1>
        <button
          type="button"
          onClick={() => setShowCreateForm((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full bg-zrp-red px-4 py-2 text-sm font-semibold text-white transition hover:bg-zrp-darkRed"
        >
          <Megaphone className="h-4 w-4" aria-hidden="true" />
          {t("adminAnnouncements.createButton")}
        </button>
      </div>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{t("adminAnnouncements.subtitle")}</p>

      {showCreateForm && (
        <div className="mb-6 grid grid-cols-1 gap-6 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-zrp-deepBlack lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label htmlFor="announcement-title" className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                {t("adminAnnouncements.formTitleLabel")}
              </label>
              <input
                id="announcement-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("adminAnnouncements.formTitlePlaceholder")}
                maxLength={TITLE_MAX_LENGTH}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
              <p className="mt-1 text-right text-xs text-gray-400">
                {t("adminAnnouncements.formCharCount", { count: title.length, max: TITLE_MAX_LENGTH })}
              </p>
            </div>

            <div>
              <label htmlFor="announcement-body" className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                {t("adminAnnouncements.formBodyLabel")}
              </label>
              <textarea
                id="announcement-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t("adminAnnouncements.formBodyPlaceholder")}
                maxLength={BODY_MAX_LENGTH}
                rows={4}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
              <p className="mt-1 text-right text-xs text-gray-400">
                {t("adminAnnouncements.formCharCount", { count: body.length, max: BODY_MAX_LENGTH })}
              </p>
            </div>

            <div>
              <label htmlFor="announcement-type" className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                {t("adminAnnouncements.formTypeLabel")}
              </label>
              <select
                id="announcement-type"
                value={type}
                onChange={(e) => setType(e.target.value as AnnouncementType)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              >
                {ANNOUNCEMENT_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {t(TYPE_LABEL_KEYS[value])}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="announcement-image" className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                {t("adminAnnouncements.formImageLabel")}
              </label>
              <input
                id="announcement-image"
                type="text"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
              <p className="mt-1 text-xs text-gray-400">{t("adminAnnouncements.formImageHint")}</p>
            </div>

            <div>
              <label htmlFor="announcement-action-url" className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                {t("adminAnnouncements.formActionUrlLabel")}
              </label>
              <input
                id="announcement-action-url"
                type="text"
                value={actionUrl}
                onChange={(e) => setActionUrl(e.target.value)}
                placeholder={t("adminAnnouncements.formActionUrlPlaceholder")}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>

            <div>
              <label htmlFor="announcement-schedule" className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                {t("adminAnnouncements.formScheduleLabel")}
              </label>
              <input
                id="announcement-schedule"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
              <p className="mt-1 text-xs text-gray-400">{t("adminAnnouncements.formScheduleHint")}</p>
            </div>

            {formError && (
              <p role="alert" aria-live="polite" className="text-sm text-zrp-red">
                {formError}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                aria-busy={creating}
                className="inline-flex items-center gap-1.5 rounded-full bg-zrp-red px-4 py-2 text-sm font-semibold text-white transition hover:bg-zrp-darkRed disabled:opacity-60"
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {creating ? t("adminAnnouncements.saving") : t("adminAnnouncements.createButton")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  resetForm();
                }}
                disabled={creating}
                className="rounded-full px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                {t("action.cancel")}
              </button>
            </div>
          </div>

          <div>
            <AnnouncementPreview title={title} body={body} imageUrl={imageUrl || null} actionUrl={actionUrl || null} />
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {filterTabs.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
              statusFilter === s
                ? "border-zrp-red bg-zrp-red text-white"
                : "border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300"
            }`}
          >
            {s === "all" ? t("adminAds.filterAll") : t(STATUS_LABEL_KEYS[s] ?? "ads.status.draft")}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zrp-red border-t-transparent" />
        </div>
      ) : loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-900/20">
          <p className="font-semibold text-red-700 dark:text-red-400">{t("adminAnnouncements.loadError")}</p>
          <button
            onClick={() => fetchAnnouncements(statusFilter)}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-red-100 px-4 py-2 text-sm font-semibold text-red-700 dark:bg-red-800 dark:text-red-300"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {t("feed.retry")}
          </button>
        </div>
      ) : announcements.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title={t("adminAnnouncements.emptyTitle")}
          body={t("adminAnnouncements.emptyDesc")}
          primaryAction={{ label: t("adminAnnouncements.createButton"), onClick: () => setShowCreateForm(true) }}
        />
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => {
            const progressPct = a.totalRecipients > 0 ? Math.min(100, Math.round((a.processedCount / a.totalRecipients) * 100)) : 0;
            return (
              <Link
                key={a.id}
                href={`/admin/announcements/${a.id}`}
                className="block rounded-xl border border-gray-200 bg-white p-4 transition hover:border-zrp-red/40 hover:shadow-sm dark:border-gray-700 dark:bg-zrp-deepBlack"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-gray-900 dark:text-white">{a.title}</p>
                    <p className="mt-0.5 line-clamp-1 text-sm text-gray-500 dark:text-gray-400">{a.body}</p>
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end gap-1">
                    <StatusBadge status={a.status} />
                    <span className="text-xs text-gray-400">{t(TYPE_LABEL_KEYS[a.type] ?? "adminAnnouncements.typeAnnouncement")}</span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
                  <span>{new Date(a.createdAt).toLocaleString(getDateLocale(language))}</span>
                  {a.scheduledAt && (
                    <span>
                      {t("adminAnnouncements.scheduledForLabel")}: {new Date(a.scheduledAt).toLocaleString(getDateLocale(language))}
                    </span>
                  )}
                  {a.totalRecipients > 0 && (
                    <span>
                      {t("adminAnnouncements.recipientsLabel")}: {a.processedCount}/{a.totalRecipients} ({progressPct}%)
                    </span>
                  )}
                </div>

                {(a.status === "SENDING" || a.status === "PARTIAL" || a.status === "SENT") && a.totalRecipients > 0 && (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                    <div className="h-full rounded-full bg-zrp-red" style={{ width: `${progressPct}%` }} />
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
