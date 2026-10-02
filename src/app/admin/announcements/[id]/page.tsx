"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Megaphone } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getDateLocale } from "@/lib/dateLocale";
import { localizeApiMessage } from "@/lib/api-error-i18n";
import ConfirmModal from "@/components/ConfirmModal";
import SendAnnouncementModal from "@/components/admin/SendAnnouncementModal";
import AnnouncementPreview from "@/components/admin/AnnouncementPreview";
import type { TranslationKey } from "@/lib/translations";
import {
  ANNOUNCEMENT_TYPES,
  TITLE_MAX_LENGTH,
  BODY_MAX_LENGTH,
  type AnnouncementType,
  validateAnnouncementContent,
} from "@/lib/announcements/types";

interface Announcement {
  id: string;
  title: string;
  body: string;
  type: string;
  status: string;
  imageUrl: string | null;
  actionUrl: string | null;
  createdById: string;
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

const STATUS_LABEL_KEYS: Record<string, TranslationKey> = {
  DRAFT: "ads.status.draft",
  SCHEDULED: "settings.scheduled",
  SENDING: "settings.sending",
  SENT: "adminSubscriptions.sentStatus",
  PARTIAL: "adminAnnouncements.statusPartial",
  FAILED: "adminLaunchpad.statusFailed",
  CANCELLED: "ads.status.cancelled",
};

// Terminal states - once reached, the row never changes again, so
// polling (while SENDING) stops here. See mission requirement: "Do NOT
// create an aggressive polling loop" / "Stop polling automatically".
const TERMINAL_STATUSES = new Set(["SENT", "PARTIAL", "FAILED", "CANCELLED"]);
const POLL_INTERVAL_MS = 4000;

export default function AdminAnnouncementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t, language } = useLanguage();
  const { data: session, status: sessionStatus } = useSession();

  const isFullAdmin = session?.user?.isAdmin || session?.user?.role === "ADMIN";

  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<AnnouncementType>("ANNOUNCEMENT");
  const [imageUrl, setImageUrl] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  const [showSendModal, setShowSendModal] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAnnouncement = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      setLoadError(false);
      try {
        const res = await fetch(`/api/admin/announcements/${id}`);
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) {
          setLoadError(true);
          return;
        }
        const data: Announcement = await res.json();
        setAnnouncement(data);
        if (!editing) {
          setTitle(data.title);
          setBody(data.body);
          setType((data.type as AnnouncementType) ?? "ANNOUNCEMENT");
          setImageUrl(data.imageUrl ?? "");
          setActionUrl(data.actionUrl ?? "");
          setScheduledAt(data.scheduledAt ? toLocalDatetimeInputValue(data.scheduledAt) : "");
        }
      } catch (error) {
        console.error("Error fetching announcement:", error);
        setLoadError(true);
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id]
  );

  useEffect(() => {
    if (isFullAdmin) fetchAnnouncement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullAdmin, id]);

  // Poll only while SENDING, at a fixed, non-aggressive interval, and
  // stop the moment a terminal status is reached - re-armed via a plain
  // setTimeout chain (not setInterval) so a slow response can never
  // stack up overlapping requests.
  useEffect(() => {
    if (!announcement || TERMINAL_STATUSES.has(announcement.status)) {
      if (pollTimer.current) clearTimeout(pollTimer.current);
      return;
    }
    if (announcement.status !== "SENDING") return;

    pollTimer.current = setTimeout(() => {
      fetchAnnouncement({ silent: true });
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [announcement, fetchAnnouncement]);

  const handleSave = async () => {
    setFormError(null);
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

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/announcements/${id}`, {
        method: "PATCH",
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
      setAnnouncement(data);
      setEditing(false);
      setSaveToast(t("adminAnnouncements.saveSuccessToast"));
      setTimeout(() => setSaveToast(null), 4000);
    } catch (error) {
      console.error("Error saving announcement:", error);
      setFormError(t("auth.errTryAgain"));
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async () => {
    setSendError(null);
    setSending(true);
    try {
      const res = await fetch(`/api/admin/announcements/${id}/send`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendError(localizeApiMessage(data.error, t) || t("auth.errTryAgain"));
        setSending(false);
        return;
      }
      setShowSendModal(false);
      setSending(false);
      // Switch straight to live progress - re-fetch the full row rather
      // than trusting the send response's partial shape.
      fetchAnnouncement();
    } catch (error) {
      console.error("Error sending announcement:", error);
      setSendError(t("auth.errTryAgain"));
      setSending(false);
    }
  };

  const handleCancel = async () => {
    setCancelError(null);
    setCancelling(true);
    try {
      const res = await fetch(`/api/admin/announcements/${id}/cancel`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 409) {
        setCancelError(localizeApiMessage(data.error, t) || t("auth.errTryAgain"));
        return;
      }
      setShowCancelModal(false);
      fetchAnnouncement();
    } catch (error) {
      console.error("Error cancelling announcement:", error);
      setCancelError(t("auth.errTryAgain"));
    } finally {
      setCancelling(false);
    }
  };

  if (sessionStatus === "loading" || !session) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zrp-red" aria-hidden="true" />
      </div>
    );
  }

  if (!isFullAdmin) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zrp-red" aria-hidden="true" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="py-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">{t("adminAnnouncements.notFound")}</p>
        <Link href="/admin/announcements" className="mt-4 inline-block text-sm font-medium text-zrp-red hover:underline">
          {t("adminAnnouncements.backToList")}
        </Link>
      </div>
    );
  }

  if (loadError || !announcement) {
    return (
      <div className="py-8 text-center">
        <p className="font-semibold text-red-700 dark:text-red-400">{t("adminAnnouncements.loadError")}</p>
        <button
          onClick={() => fetchAnnouncement()}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-red-100 px-4 py-2 text-sm font-semibold text-red-700 dark:bg-red-800 dark:text-red-300"
        >
          {t("feed.retry")}
        </button>
      </div>
    );
  }

  const canEdit = announcement.status === "DRAFT" || announcement.status === "SCHEDULED";
  const canSend = announcement.status === "DRAFT" || announcement.status === "SCHEDULED";
  const canCancel = !TERMINAL_STATUSES.has(announcement.status);
  const progressPct =
    announcement.totalRecipients > 0
      ? Math.min(100, Math.round((announcement.processedCount / announcement.totalRecipients) * 100))
      : 0;

  return (
    <div>
      <Link href="/admin/announcements" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-zrp-red hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("adminAnnouncements.backToList")}
      </Link>

      {saveToast && (
        <div role="status" className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
          {saveToast}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-zrp-red" aria-hidden="true" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              {editing ? t("action.edit") : announcement.title}
            </h1>
          </div>

          {!editing ? (
            <>
              <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{announcement.body}</p>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-gray-400">{t("adminAnnouncements.formTypeLabel")}</dt>
                <dd className="text-gray-900 dark:text-white">{t(TYPE_LABEL_KEYS[announcement.type] ?? "adminAnnouncements.typeAnnouncement")}</dd>

                <dt className="text-gray-400">{t("support.ticketDetail.createdLabel")}</dt>
                <dd className="text-gray-900 dark:text-white">{new Date(announcement.createdAt).toLocaleString(getDateLocale(language))}</dd>

                <dt className="text-gray-400">{t("adminAnnouncements.updatedAtLabel")}</dt>
                <dd className="text-gray-900 dark:text-white">{new Date(announcement.updatedAt).toLocaleString(getDateLocale(language))}</dd>

                {announcement.scheduledAt && (
                  <>
                    <dt className="text-gray-400">{t("adminAnnouncements.scheduledForLabel")}</dt>
                    <dd className="text-gray-900 dark:text-white">{new Date(announcement.scheduledAt).toLocaleString(getDateLocale(language))}</dd>
                  </>
                )}
                {announcement.sendStartedAt && (
                  <>
                    <dt className="text-gray-400">{t("adminAnnouncements.startedAtLabel")}</dt>
                    <dd className="text-gray-900 dark:text-white">{new Date(announcement.sendStartedAt).toLocaleString(getDateLocale(language))}</dd>
                  </>
                )}
                {announcement.completedAt && (
                  <>
                    <dt className="text-gray-400">{t("adminAnnouncements.completedAtLabel")}</dt>
                    <dd className="text-gray-900 dark:text-white">{new Date(announcement.completedAt).toLocaleString(getDateLocale(language))}</dd>
                  </>
                )}
                {announcement.actionUrl && (
                  <>
                    <dt className="text-gray-400">{t("adminAnnouncements.formActionUrlLabel")}</dt>
                    <dd className="truncate text-zrp-red">{announcement.actionUrl}</dd>
                  </>
                )}
              </dl>

              <div className="flex flex-wrap gap-2 pt-2">
                {canSend && (
                  <button
                    type="button"
                    onClick={() => setShowSendModal(true)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-zrp-red px-4 py-2 text-sm font-semibold text-white transition hover:bg-zrp-darkRed"
                  >
                    <Megaphone className="h-4 w-4" aria-hidden="true" />
                    {t("adminAnnouncements.sendButton")}
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    {t("action.edit")}
                  </button>
                )}
                {canCancel && (
                  <button
                    type="button"
                    onClick={() => setShowCancelModal(true)}
                    className="rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-zrp-red transition hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
                  >
                    {t("action.cancel")}
                  </button>
                )}
              </div>

              {!canEdit && (
                <p className="text-xs text-gray-400">{t("adminAnnouncements.editLockedNote")}</p>
              )}

              {sendError && (
                <p role="alert" className="text-sm text-zrp-red">{sendError}</p>
              )}
              {cancelError && (
                <p role="alert" className="text-sm text-zrp-red">{cancelError}</p>
              )}

              {/* Progress / stats - visible for any status once a send
                  has at least started (SENDING/SENT/PARTIAL/FAILED). */}
              {announcement.sendStartedAt && (
                <div className="mt-4 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                  <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
                    {t("adminAnnouncements.progressHeading")}
                  </h2>
                  <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                    <div
                      className="h-full rounded-full bg-zrp-red transition-all"
                      style={{ width: `${progressPct}%` }}
                      role="progressbar"
                      aria-valuenow={progressPct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    />
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <dt className="text-gray-400">{t("adminAnnouncements.totalRecipients")}</dt>
                    <dd className="text-gray-900 dark:text-white">{announcement.totalRecipients}</dd>
                    <dt className="text-gray-400">{t("adminAnnouncements.processedCount")}</dt>
                    <dd className="text-gray-900 dark:text-white">
                      {announcement.processedCount} ({progressPct}%)
                    </dd>
                    {announcement.failedBatchCount > 0 && (
                      <>
                        <dt className="text-gray-400">{t("adminAnnouncements.failedBatches")}</dt>
                        <dd className="text-zrp-red">{announcement.failedBatchCount}</dd>
                      </>
                    )}
                  </dl>
                  <p className="mt-3 text-xs text-gray-400">{t("adminAnnouncements.deliveryNote")}</p>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div>
                <label htmlFor="edit-title" className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  {t("adminAnnouncements.formTitleLabel")}
                </label>
                <input
                  id="edit-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={TITLE_MAX_LENGTH}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                />
                <p className="mt-1 text-right text-xs text-gray-400">
                  {t("adminAnnouncements.formCharCount", { count: title.length, max: TITLE_MAX_LENGTH })}
                </p>
              </div>

              <div>
                <label htmlFor="edit-body" className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  {t("adminAnnouncements.formBodyLabel")}
                </label>
                <textarea
                  id="edit-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  maxLength={BODY_MAX_LENGTH}
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                />
                <p className="mt-1 text-right text-xs text-gray-400">
                  {t("adminAnnouncements.formCharCount", { count: body.length, max: BODY_MAX_LENGTH })}
                </p>
              </div>

              <div>
                <label htmlFor="edit-type" className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  {t("adminAnnouncements.formTypeLabel")}
                </label>
                <select
                  id="edit-type"
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
                <label htmlFor="edit-image" className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  {t("adminAnnouncements.formImageLabel")}
                </label>
                <input
                  id="edit-image"
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label htmlFor="edit-action-url" className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  {t("adminAnnouncements.formActionUrlLabel")}
                </label>
                <input
                  id="edit-action-url"
                  type="text"
                  value={actionUrl}
                  onChange={(e) => setActionUrl(e.target.value)}
                  placeholder={t("adminAnnouncements.formActionUrlPlaceholder")}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label htmlFor="edit-schedule" className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  {t("adminAnnouncements.formScheduleLabel")}
                </label>
                <input
                  id="edit-schedule"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                />
              </div>

              {formError && (
                <p role="alert" aria-live="polite" className="text-sm text-zrp-red">
                  {formError}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  aria-busy={saving}
                  className="inline-flex items-center gap-1.5 rounded-full bg-zrp-red px-4 py-2 text-sm font-semibold text-white transition hover:bg-zrp-darkRed disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {saving ? t("adminAnnouncements.saving") : t("action.save")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setFormError(null);
                    setTitle(announcement.title);
                    setBody(announcement.body);
                    setType((announcement.type as AnnouncementType) ?? "ANNOUNCEMENT");
                    setImageUrl(announcement.imageUrl ?? "");
                    setActionUrl(announcement.actionUrl ?? "");
                    setScheduledAt(announcement.scheduledAt ? toLocalDatetimeInputValue(announcement.scheduledAt) : "");
                  }}
                  disabled={saving}
                  className="rounded-full px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  {t("action.cancel")}
                </button>
              </div>
            </div>
          )}
        </div>

        <div>
          <AnnouncementPreview
            title={editing ? title : announcement.title}
            body={editing ? body : announcement.body}
            imageUrl={editing ? imageUrl || null : announcement.imageUrl}
            actionUrl={editing ? actionUrl || null : announcement.actionUrl}
          />
        </div>
      </div>

      {showSendModal && (
        <SendAnnouncementModal
          title={announcement.title}
          body={announcement.body}
          recipientCount={null}
          busy={sending}
          onConfirm={handleSend}
          onCancel={() => setShowSendModal(false)}
        />
      )}

      {showCancelModal && (
        <ConfirmModal
          title={t("adminAnnouncements.cancelConfirmTitle")}
          body={
            announcement.status === "SENDING"
              ? t("adminAnnouncements.cancelConfirmBodyMidSend")
              : t("adminAnnouncements.cancelConfirmBodyBeforeSend")
          }
          confirmLabel={t("action.cancel")}
          cancelLabel={t("adminSubscriptionDetail.no")}
          destructive
          busy={cancelling}
          onConfirm={handleCancel}
          onCancel={() => setShowCancelModal(false)}
        />
      )}
    </div>
  );
}

function toLocalDatetimeInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
