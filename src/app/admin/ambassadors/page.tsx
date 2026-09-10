"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search, ExternalLink } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { flagEmoji } from "@/lib/ambassadors/countries";
import type { TranslationKey } from "@/lib/translations";

/*
 * /admin/ambassadors - the review queue behind
 * PATCH /api/admin/ambassadors/[id] and GET /api/admin/ambassadors.
 * Deliberately mirrors /admin/journalists/page.tsx (tabs, search,
 * card list, native confirm()/prompt() for destructive/reasoned
 * actions) - the same review workflow ZRP already has, reused rather
 * than reinvented, with generic action words shared via the existing
 * adminJournalists.* translation keys and only ambassador-specific
 * copy added new.
 */
type AmbassadorStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";

interface AmbassadorProfile {
  id: string;
  status: AmbassadorStatus;
  countryCode: string;
  countryName: string;
  cityRegion: string | null;
  languages: string[];
  communityLinks: string[];
  motivation: string;
  communityDescription: string | null;
  audienceSize: number | null;
  rejectionReason: string | null;
  suspensionReason: string | null;
  appliedAt: string;
  user: { id: string; username: string; name: string | null; email: string; avatarUrl: string | null };
}

const STATUS_TABS: Array<{ value: AmbassadorStatus | ""; labelKey: TranslationKey }> = [
  { value: "PENDING", labelKey: "adminJournalists.tabPending" },
  { value: "APPROVED", labelKey: "adminAmbassadors.tabApproved" },
  { value: "SUSPENDED", labelKey: "adminJournalists.tabSuspended" },
  { value: "REJECTED", labelKey: "adminJournalists.tabRejected" },
  { value: "", labelKey: "adminJournalists.tabAll" },
];

const STATUS_STYLES: Record<AmbassadorStatus, string> = {
  PENDING: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  APPROVED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  REJECTED: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  SUSPENDED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const STATUS_LABEL_KEYS: Record<AmbassadorStatus, TranslationKey> = {
  PENDING: "adminJournalists.tabPending",
  APPROVED: "adminAmbassadors.tabApproved",
  REJECTED: "adminJournalists.tabRejected",
  SUSPENDED: "adminJournalists.tabSuspended",
};

const ACTION_ERROR_KEYS = {
  approve: "adminAmbassadors.errFailedApprove",
  reject: "adminAmbassadors.errFailedReject",
  suspend: "adminAmbassadors.errFailedSuspend",
  restore: "adminAmbassadors.errFailedRestore",
} as const satisfies Record<string, TranslationKey>;

const ACTION_SUCCESS_KEYS = {
  approve: "adminAmbassadors.successApprove",
  reject: "adminAmbassadors.successReject",
  suspend: "adminAmbassadors.successSuspend",
  restore: "adminAmbassadors.successRestore",
} as const satisfies Record<string, TranslationKey>;

export default function AdminAmbassadorsPage() {
  const { t } = useLanguage();
  const [profiles, setProfiles] = useState<AmbassadorProfile[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [statusTab, setStatusTab] = useState<AmbassadorStatus | "">("PENDING");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusTab) params.set("status", statusTab);
      if (search.trim()) params.set("search", search.trim());

      const response = await fetch(`/api/admin/ambassadors?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || t("adminAmbassadors.errFailedLoad"));
      }

      setProfiles(data.profiles || []);
      setCounts(data.counts || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : t("adminAmbassadors.errFailedLoad"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusTab]);

  async function act(userId: string, action: "approve" | "reject" | "suspend" | "restore") {
    let reason: string | null = null;

    if (action === "reject" || action === "suspend") {
      reason = window.prompt(
        action === "reject"
          ? t("adminJournalists.promptRejectReason")
          : t("adminAmbassadors.promptSuspendReason"),
      );
      if (reason === null) return; // cancelled
    } else {
      const confirmed = window.confirm(
        action === "approve" ? t("adminAmbassadors.confirmApprove") : t("adminAmbassadors.confirmRestore"),
      );
      if (!confirmed) return;
    }

    try {
      setActingOn(userId);
      setError(null);
      setSuccess(null);

      const response = await fetch(`/api/admin/ambassadors/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reason || undefined }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || t(ACTION_ERROR_KEYS[action]));
      }

      setSuccess(t(ACTION_SUCCESS_KEYS[action]));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(ACTION_ERROR_KEYS[action]));
    } finally {
      setActingOn(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <Link
          href="/admin"
          className="mb-3 inline-flex items-center gap-2 text-sm text-gray-500 transition hover:text-red-600 dark:text-gray-400"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("adminJournalists.backToAdmin")}
        </Link>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t("adminAmbassadors.title")}</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("adminAmbassadors.subtitle")}</p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              load();
            }}
            className="flex items-center gap-2"
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("adminJournalists.searchPlaceholder")}
                className="rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              />
            </div>
          </form>
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300">
            {success}
          </div>
        )}

        <div className="mb-5 flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value || "all"}
              type="button"
              onClick={() => setStatusTab(tab.value)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                statusTab === tab.value
                  ? "bg-zrp-red text-white"
                  : "bg-white text-gray-700 hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
              }`}
            >
              {t(tab.labelKey)}
              {tab.value && counts[tab.value] !== undefined ? ` (${counts[tab.value]})` : ""}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          {loading ? (
            <p className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              {t("adminJournalists.loading")}
            </p>
          ) : profiles.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              {t("adminAmbassadors.noApplicationsFound")}
            </p>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-800">
              {profiles.map((profile) => (
                <li
                  key={profile.id}
                  className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {profile.user.name || profile.user.username}
                      </p>
                      <span className="text-sm text-gray-500 dark:text-gray-400">@{profile.user.username}</span>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[profile.status]}`}
                      >
                        {t(STATUS_LABEL_KEYS[profile.status])}
                      </span>
                    </div>

                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{profile.user.email}</p>

                    <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                      <span className="font-medium">{t("adminAmbassadors.countryLabel")}</span>{" "}
                      <span aria-hidden="true">{flagEmoji(profile.countryCode)}</span> {profile.countryName}
                      {profile.cityRegion ? ` · ${profile.cityRegion}` : ""}
                    </p>

                    {profile.languages.length > 0 && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {profile.languages.join(", ")}
                      </p>
                    )}

                    <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
                      <span className="font-medium">{t("adminAmbassadors.motivationLabel")}</span>{" "}
                      {profile.motivation}
                    </p>

                    {profile.audienceSize !== null && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {t("adminAmbassadors.audienceLabel")} {profile.audienceSize.toLocaleString()}
                      </p>
                    )}

                    {profile.communityLinks.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-3">
                        {profile.communityLinks.map((link) => (
                          <a
                            key={link}
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {link.replace(/^https?:\/\//, "")}
                          </a>
                        ))}
                      </div>
                    )}

                    {profile.status === "REJECTED" && profile.rejectionReason && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {t("adminJournalists.rejectedPrefix", { reason: profile.rejectionReason })}
                      </p>
                    )}
                    {profile.status === "SUSPENDED" && profile.suspensionReason && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {t("adminJournalists.suspendedPrefix", { reason: profile.suspensionReason })}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {profile.status === "PENDING" && (
                      <>
                        <button
                          type="button"
                          disabled={actingOn === profile.user.id}
                          onClick={() => act(profile.user.id, "approve")}
                          className="rounded-lg bg-zrp-red px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zrp-darkRed disabled:opacity-50"
                        >
                          {t("adminJournalists.approve")}
                        </button>
                        <button
                          type="button"
                          disabled={actingOn === profile.user.id}
                          onClick={() => act(profile.user.id, "reject")}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          {t("adminJournalists.reject")}
                        </button>
                      </>
                    )}
                    {profile.status === "APPROVED" && (
                      <button
                        type="button"
                        disabled={actingOn === profile.user.id}
                        onClick={() => act(profile.user.id, "suspend")}
                        className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        {t("adminJournalists.suspend")}
                      </button>
                    )}
                    {profile.status === "SUSPENDED" && (
                      <button
                        type="button"
                        disabled={actingOn === profile.user.id}
                        onClick={() => act(profile.user.id, "restore")}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        {t("adminJournalists.restore")}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
