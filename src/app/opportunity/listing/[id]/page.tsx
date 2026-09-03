"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowLeft, MapPin, Laptop, Calendar, ExternalLink, Bookmark, BookMarked, Users, Pencil } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import VerifiedBadge from "@/components/VerifiedBadge";
import ApplyModal from "@/components/opportunity/ApplyModal";
import { TYPE_META, type OpportunitySummary } from "@/lib/opportunity";

interface ListingDetail extends OpportunitySummary {
  posterId?: string;
  alreadyApplied?: boolean;
}

const LOCALE_MAP: Record<string, string> = {
  en: "en-US", fr: "fr-FR", de: "de-DE", it: "it-IT", sq: "sq-AL",
  es: "es-ES", ru: "ru-RU", ar: "ar-SA", zh: "zh-CN", tr: "tr-TR", id: "id-ID",
};

export default function OpportunityListingPage() {
  const { t, language } = useLanguage();
  const { data: session } = useSession();
  const params = useParams<{ id: string }>();
  const locale = LOCALE_MAP[language] || "en-US";

  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showApply, setShowApply] = useState(false);
  const [applied, setApplied] = useState(false);
  // Distinct from `applied` so the confirmation text can say "already
  // applied" for an application hydrated from a prior visit, vs. "sent"
  // for one that was literally just submitted this page load.
  const [justApplied, setJustApplied] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = () => {
    fetch(`/api/opportunity/${params.id}`)
      .then((res) => {
        if (!res.ok) throw new Error("not found");
        return res.json();
      })
      .then((data) => {
        setListing(data.listing);
        setApplied(!!data.listing?.alreadyApplied);
      })
      .catch(() => setError(t("opportunity.errLoadFailed")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const toggleSave = async () => {
    try {
      await fetch(`/api/opportunity/${params.id}/save`, { method: saved ? "DELETE" : "POST" });
      setSaved((s) => !s);
    } catch (err) {
      console.error("Error toggling saved opportunity:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="w-8 h-8 border-4 border-zrp-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center text-gray-500 dark:text-gray-400">
        <p>{error || t("opportunity.errLoadFailed")}</p>
        <Link href="/opportunity" className="inline-block mt-4 text-zrp-red font-semibold hover:underline">
          {t("opportunity.backToOpportunity")}
        </Link>
      </div>
    );
  }

  const meta = TYPE_META[listing.type];
  const isOwner = session?.user?.id === listing.posterId;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link href="/opportunity" className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-zrp-red transition mb-4">
        <ArrowLeft className="w-4 h-4" />
        {t("opportunity.backToOpportunity")}
      </Link>

      <div className="bg-white dark:bg-zrp-deepBlack rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zrp-red">
              <meta.icon className="w-4 h-4" />
              {t(meta.labelKey)}
            </span>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-2">{listing.title}</h1>
            {listing.organizationName && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{listing.organizationName}</p>}
          </div>
          {session?.user && !isOwner && (
            <button type="button" onClick={toggleSave} aria-label={t("opportunity.save")} className="flex-shrink-0">
              {saved ? <BookMarked className="w-5 h-5 text-zrp-red" /> : <Bookmark className="w-5 h-5 text-gray-400" />}
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-3 mt-4 text-sm text-gray-600 dark:text-gray-300">
          {listing.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              {listing.location}
            </span>
          )}
          {listing.remote && (
            <span className="inline-flex items-center gap-1">
              <Laptop className="w-4 h-4" />
              {t("opportunity.remote")}
            </span>
          )}
          {listing.deadline && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {new Date(listing.deadline).toLocaleDateString(locale)}
            </span>
          )}
        </div>

        {listing.compensationInfo && (
          <p className="mt-3 text-sm font-semibold text-gray-900 dark:text-white">{listing.compensationInfo}</p>
        )}

        {listing.skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {listing.skills.map((skill) => (
              <span key={skill} className="px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-300">
                {skill}
              </span>
            ))}
          </div>
        )}

        <p className="mt-5 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{listing.description}</p>

        {listing.poster && (
          <div className="flex items-center gap-2 mt-6 pt-4 border-t border-gray-100 dark:border-gray-800">
            <img src={listing.poster.avatarUrl || "/default-avatar.png"} alt={listing.poster.username} className="w-8 h-8 rounded-full object-cover" />
            <Link href={`/profile/${listing.poster.username}`} className="flex items-center gap-1 text-sm font-semibold text-gray-900 dark:text-white hover:text-zrp-red transition">
              @{listing.poster.username}
              <VerifiedBadge badgeType={listing.poster.badgeType} />
            </Link>
          </div>
        )}

        <div className="mt-6">
          {isOwner ? (
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/opportunity/listing/${listing.id}/applicants`}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-zrp-red text-white font-semibold hover:bg-red-600 transition"
              >
                <Users className="w-4 h-4" />
                {t("opportunity.viewApplicants", { n: listing._count?.applications ?? 0 })}
              </Link>
              <Link
                href={`/opportunity/edit/${listing.id}`}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold hover:border-zrp-red hover:text-zrp-red transition"
              >
                <Pencil className="w-4 h-4" />
                {t("opportunity.editListing")}
              </Link>
            </div>
          ) : !session?.user ? (
            <Link href="/login" className="inline-block px-5 py-2.5 rounded-full bg-zrp-red text-white font-semibold hover:bg-red-600 transition">
              {t("opportunity.loginToApply")}
            </Link>
          ) : listing.externalUrl ? (
            <a
              href={listing.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-zrp-red text-white font-semibold hover:bg-red-600 transition"
            >
              <ExternalLink className="w-4 h-4" />
              {t("opportunity.applyExternally")}
            </a>
          ) : applied ? (
            <p className="text-sm font-semibold text-green-600 dark:text-green-400">
              {justApplied ? t("opportunity.applicationSent") : t("opportunity.alreadyApplied")}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setShowApply(true)}
              className="px-5 py-2.5 rounded-full bg-zrp-red text-white font-semibold hover:bg-red-600 transition"
            >
              {t("opportunity.apply")}
            </button>
          )}
        </div>
      </div>

      {showApply && (
        <ApplyModal
          listingId={listing.id}
          onClose={() => setShowApply(false)}
          onApplied={() => {
            setShowApply(false);
            setApplied(true);
            setJustApplied(true);
          }}
        />
      )}
    </div>
  );
}
