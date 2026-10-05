"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Users, Pencil, Trash2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { STATUS_LABEL_KEYS, STATUS_STYLES, TYPE_META, type OpportunitySummary } from "@/lib/opportunity";

interface MyListing extends OpportunitySummary {
  status: NonNullable<OpportunitySummary["status"]>;
}

export default function MyOpportunityListingsPage() {
  const { t } = useLanguage();
  const [listings, setListings] = useState<MyListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/opportunity/my-listings")
      .then((res) => res.json())
      .then((data) => setListings(data.listings || []))
      .catch((err) => console.error("Error loading my opportunity listings:", err))
      .finally(() => setLoading(false));
  }, []);

  // Mirrors marketplace/my-listings' own handleDelete exactly (same
  // confirm()/DELETE/optimistic-removal shape) - see
  // src/app/marketplace/my-listings/page.tsx. The backend route
  // (DELETE /api/opportunity/{id}) already enforced owner/admin
  // authorization and cascade-deleted applications/saved rows; this was
  // the only missing piece - no button anywhere called it.
  const handleDelete = async (id: string) => {
    if (!confirm(t("opportunity.confirmDelete"))) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/opportunity/${id}`, { method: "DELETE" });
      if (res.ok) {
        setListings((prev) => prev.filter((l) => l.id !== id));
      } else {
        alert(t("opportunity.errDeleteFailed"));
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link href="/opportunity" className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-zrp-red transition mb-4">
        <ArrowLeft className="w-4 h-4 rtl:-scale-x-100" />
        {t("opportunity.backToOpportunity")}
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">{t("opportunity.myListings")}</h1>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-zrp-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : listings.length === 0 ? (
        <p className="text-center py-16 text-gray-500 dark:text-gray-400">{t("opportunity.noOwnListings")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {listings.map((listing) => {
            const meta = TYPE_META[listing.type];
            return (
              <div key={listing.id} className="p-4 bg-white dark:bg-zrp-deepBlack rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-zrp-red">
                      <meta.icon className="w-3.5 h-3.5" />
                      {t(meta.labelKey)}
                    </span>
                    <Link href={`/opportunity/listing/${listing.id}`} className="block font-semibold text-gray-900 dark:text-white hover:text-zrp-red transition truncate">
                      {listing.title}
                    </Link>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex-shrink-0 ${STATUS_STYLES[listing.status]}`}>
                    {t(STATUS_LABEL_KEYS[listing.status])}
                  </span>
                </div>
                {listing.rejectionReason && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{listing.rejectionReason}</p>
                )}
                {/* flex-wrap: this row now holds 3 actions (View Applicants,
                    Edit, Delete) instead of the original 2 - on a narrow
                    phone (~320px) the combined width can exceed the
                    viewport, so this wraps to a second line instead of
                    overflowing/clipping, matching the mobile-safety intent
                    of marketplace/my-listings' own responsive action row. */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2">
                  <Link
                    href={`/opportunity/listing/${listing.id}/applicants`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-zrp-red hover:underline"
                  >
                    <Users className="w-3.5 h-3.5" />
                    {t("opportunity.viewApplicants", { n: listing._count?.applications ?? 0 })}
                  </Link>
                  <Link
                    href={`/opportunity/edit/${listing.id}`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-zrp-red hover:underline"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    {t("opportunity.editListing")}
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(listing.id)}
                    disabled={deletingId === listing.id}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {t("opportunity.delete")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
