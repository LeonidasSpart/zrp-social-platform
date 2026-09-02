"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { APPLICATION_STATUS_LABEL_KEYS, APPLICATION_STATUS_STYLES, TYPE_META, type ApplicationStatus, type OpportunityType } from "@/lib/opportunity";

interface MyApplication {
  id: string;
  status: ApplicationStatus;
  createdAt: string;
  listing: { id: string; type: OpportunityType; title: string; organizationName: string | null; status: string };
}

export default function MyApplicationsPage() {
  const { t } = useLanguage();
  const [applications, setApplications] = useState<MyApplication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/opportunity/my-applications")
      .then((res) => res.json())
      .then((data) => setApplications(data.applications || []))
      .catch((err) => console.error("Error loading my applications:", err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link href="/opportunity" className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-zrp-red transition mb-4">
        <ArrowLeft className="w-4 h-4" />
        {t("opportunity.backToOpportunity")}
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">{t("opportunity.myApplications")}</h1>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-zrp-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : applications.length === 0 ? (
        <p className="text-center py-16 text-gray-500 dark:text-gray-400">{t("opportunity.noApplicationsYet")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {applications.map((app) => {
            const meta = TYPE_META[app.listing.type];
            return (
              <Link
                key={app.id}
                href={`/opportunity/listing/${app.listing.id}`}
                className="p-4 bg-white dark:bg-zrp-deepBlack rounded-xl border border-gray-200 dark:border-gray-700 hover:border-zrp-red transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-zrp-red">
                      <meta.icon className="w-3.5 h-3.5" />
                      {t(meta.labelKey)}
                    </span>
                    <p className="font-semibold text-gray-900 dark:text-white truncate">{app.listing.title}</p>
                    {app.listing.organizationName && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">{app.listing.organizationName}</p>
                    )}
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex-shrink-0 ${APPLICATION_STATUS_STYLES[app.status]}`}>
                    {t(APPLICATION_STATUS_LABEL_KEYS[app.status])}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
