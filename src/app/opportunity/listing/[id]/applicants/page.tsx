"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Paperclip } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import VerifiedBadge from "@/components/VerifiedBadge";
import { APPLICATION_STATUS_LABEL_KEYS, APPLICATION_STATUS_STYLES, type ApplicationStatus } from "@/lib/opportunity";

interface Applicant {
  id: string;
  status: ApplicationStatus;
  coverNote: string | null;
  resumeUrl: string | null;
  createdAt: string;
  applicant: { id: string; username: string; name: string | null; avatarUrl: string | null; badgeType: string | null };
}

export default function ListingApplicantsPage() {
  const { t } = useLanguage();
  const params = useParams<{ id: string }>();
  const [applications, setApplications] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    fetch(`/api/opportunity/${params.id}/applications`)
      .then((res) => res.json())
      .then((data) => setApplications(data.applications || []))
      .catch((err) => console.error("Error loading applicants:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const updateStatus = async (applicationId: string, status: ApplicationStatus) => {
    setBusyId(applicationId);
    try {
      await fetch(`/api/opportunity/applications/${applicationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      load();
    } catch (err) {
      console.error("Error updating application status:", err);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link href={`/opportunity/listing/${params.id}`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-zrp-red transition mb-4">
        <ArrowLeft className="w-4 h-4" />
        {t("opportunity.backToListing")}
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">{t("opportunity.applicants")}</h1>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-zrp-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : applications.length === 0 ? (
        <p className="text-center py-16 text-gray-500 dark:text-gray-400">{t("opportunity.noApplicantsYet")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {applications.map((app) => (
            <div key={app.id} className="p-4 bg-white dark:bg-zrp-deepBlack rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <img src={app.applicant.avatarUrl || "/default-avatar.png"} alt={app.applicant.username} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                  <Link href={`/profile/${app.applicant.username}`} className="flex items-center gap-1 text-sm font-semibold text-gray-900 dark:text-white hover:text-zrp-red transition truncate">
                    @{app.applicant.username}
                    <VerifiedBadge badgeType={app.applicant.badgeType} />
                  </Link>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex-shrink-0 ${APPLICATION_STATUS_STYLES[app.status]}`}>
                  {t(APPLICATION_STATUS_LABEL_KEYS[app.status])}
                </span>
              </div>

              {app.coverNote && <p className="text-sm text-gray-700 dark:text-gray-300 mt-3 whitespace-pre-line">{app.coverNote}</p>}

              {app.resumeUrl && (
                <a
                  href={app.resumeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-zrp-red hover:underline mt-2"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  {t("opportunity.viewResume")}
                </a>
              )}

              {app.status === "PENDING" || app.status === "REVIEWED" ? (
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    disabled={busyId === app.id}
                    onClick={() => updateStatus(app.id, "ACCEPTED")}
                    className="px-3 py-1.5 text-xs font-semibold rounded-full bg-green-600 text-white hover:bg-green-700 transition disabled:opacity-50"
                  >
                    {t("opportunity.appStatusAccepted")}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === app.id}
                    onClick={() => updateStatus(app.id, "REJECTED")}
                    className="px-3 py-1.5 text-xs font-semibold rounded-full bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
                  >
                    {t("opportunity.appStatusRejected")}
                  </button>
                  {app.status === "PENDING" && (
                    <button
                      type="button"
                      disabled={busyId === app.id}
                      onClick={() => updateStatus(app.id, "REVIEWED")}
                      className="px-3 py-1.5 text-xs font-semibold rounded-full border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition disabled:opacity-50"
                    >
                      {t("opportunity.appStatusReviewed")}
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
