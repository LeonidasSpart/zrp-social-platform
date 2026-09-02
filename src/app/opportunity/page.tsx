"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Briefcase, Plus, LayoutList, FileText } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import ListingCard from "@/components/opportunity/ListingCard";
import { OPPORTUNITY_TYPES, TYPE_META, type OpportunitySummary } from "@/lib/opportunity";

export default function OpportunityHomePage() {
  const { t } = useLanguage();
  const { data: session } = useSession();
  const [listings, setListings] = useState<OpportunitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<string>("");
  const [remoteOnly, setRemoteOnly] = useState(false);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (remoteOnly) params.set("remote", "true");
    fetch(`/api/opportunity?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setListings(data.listings || []))
      .catch((err) => console.error("Error loading opportunities:", err))
      .finally(() => setLoading(false));
  }, [type, remoteOnly]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <section className="relative bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack rounded-2xl px-6 py-10 text-center mb-8">
        <div className="flex items-center justify-center gap-2">
          <Briefcase className="w-8 h-8 text-white" />
          <h1 className="text-3xl sm:text-4xl font-extrabold font-orbitron text-white">{t("opportunity.heroTitle")}</h1>
        </div>
        <p className="mt-3 text-white/80 max-w-xl mx-auto">{t("opportunity.heroSubtitle")}</p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {session?.user && (
            <Link
              href="/opportunity/create"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white text-zrp-darkRed rounded-full font-semibold hover:bg-gray-100 transition text-sm"
            >
              <Plus className="w-4 h-4" />
              {t("opportunity.postOpportunity")}
            </Link>
          )}
          {session?.user && (
            <Link
              href="/opportunity/my-listings"
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-white/40 text-white rounded-full font-semibold hover:bg-white/10 transition text-sm"
            >
              <LayoutList className="w-4 h-4" />
              {t("opportunity.myListings")}
            </Link>
          )}
          {session?.user && (
            <Link
              href="/opportunity/my-applications"
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-white/40 text-white rounded-full font-semibold hover:bg-white/10 transition text-sm"
            >
              <FileText className="w-4 h-4" />
              {t("opportunity.myApplications")}
            </Link>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <button
          type="button"
          onClick={() => setType("")}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
            type === "" ? "bg-zrp-red text-white border-zrp-red" : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"
          }`}
        >
          {t("opportunity.allTypes")}
        </button>
        {OPPORTUNITY_TYPES.map((tp) => (
          <button
            key={tp}
            type="button"
            onClick={() => setType(tp)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
              type === tp ? "bg-zrp-red text-white border-zrp-red" : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"
            }`}
          >
            {t(TYPE_META[tp].labelKey)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setRemoteOnly((r) => !r)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
            remoteOnly ? "bg-zrp-red text-white border-zrp-red" : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"
          }`}
        >
          {t("opportunity.remoteOnly")}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-zrp-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : listings.length === 0 ? (
        <p className="text-center py-16 text-gray-500 dark:text-gray-400">{t("opportunity.noListingsYet")}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </div>
  );
}
