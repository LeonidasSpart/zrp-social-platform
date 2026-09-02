"use client";

import Link from "next/link";
import { MapPin, Laptop } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import VerifiedBadge from "@/components/VerifiedBadge";
import { TYPE_META, type OpportunitySummary } from "@/lib/opportunity";

interface ListingCardProps {
  listing: OpportunitySummary;
}

export default function ListingCard({ listing }: ListingCardProps) {
  const { t } = useLanguage();
  const meta = TYPE_META[listing.type];

  return (
    <Link
      href={`/opportunity/listing/${listing.id}`}
      className="group flex flex-col gap-2 p-4 bg-white dark:bg-zrp-deepBlack rounded-xl border border-gray-200 dark:border-gray-700 hover:border-zrp-red hover:shadow-md transition"
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zrp-red">
          <meta.icon className="w-3.5 h-3.5" />
          {t(meta.labelKey)}
        </span>
        {listing.remote && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-500 dark:text-gray-400">
            <Laptop className="w-3 h-3" />
            {t("opportunity.remote")}
          </span>
        )}
      </div>
      <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-2">{listing.title}</h3>
      {listing.organizationName && (
        <p className="text-xs text-gray-500 dark:text-gray-400">{listing.organizationName}</p>
      )}
      {listing.location && (
        <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          <MapPin className="w-3 h-3" />
          {listing.location}
        </span>
      )}
      {listing.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {listing.skills.slice(0, 4).map((skill) => (
            <span
              key={skill}
              className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-[11px] text-gray-600 dark:text-gray-300"
            >
              {skill}
            </span>
          ))}
        </div>
      )}
      {listing.poster && (
        <div className="flex items-center gap-1 mt-1 text-[11px] text-gray-400 dark:text-gray-500">
          {t("play.by", { name: listing.poster.username })}
          <VerifiedBadge badgeType={listing.poster.badgeType} />
        </div>
      )}
    </Link>
  );
}
