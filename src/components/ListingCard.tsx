"use client";

import Link from "next/link";
import { Heart, MapPin, Eye, PlayCircle } from "lucide-react";
import VerifiedBadge from "@/components/VerifiedBadge";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  CATEGORY_META,
  STATUS_LABEL_KEYS,
  STATUS_STYLES,
  formatListingPrice,
  type ListingSummary,
} from "@/lib/marketplace";

interface ListingCardProps {
  listing: ListingSummary;
  favorited?: boolean;
  onToggleFavorite?: (listingId: string) => void;
  showStatus?: boolean;
}

const LOCALE_MAP: Record<string, string> = {
  en: "en-US", fr: "fr-FR", de: "de-DE", it: "it-IT", sq: "sq-AL",
  es: "es-ES", ru: "ru-RU", ar: "ar-SA", zh: "zh-CN", tr: "tr-TR", id: "id-ID",
};

export default function ListingCard({ listing, favorited, onToggleFavorite, showStatus }: ListingCardProps) {
  const { t, language } = useLanguage();
  const locale = LOCALE_MAP[language] || "en-US";
  const coverImage = listing.imageUrls[0];
  const meta = CATEGORY_META[listing.category];

  return (
    <div className="group relative bg-white dark:bg-zrp-deepBlack rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition">
      <Link href={`/marketplace/listing/${listing.id}`} className="block">
        <div className="relative aspect-[4/3] bg-gray-100 dark:bg-gray-800">
          {coverImage ? (
            <img src={coverImage} alt={listing.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <meta.icon className="w-10 h-10" />
            </div>
          )}
          {listing.videoUrl && (
            <div className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1">
              <PlayCircle className="w-4 h-4" />
            </div>
          )}
          {showStatus && listing.status && (
            <span
              className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_STYLES[listing.status]}`}
            >
              {t(STATUS_LABEL_KEYS[listing.status])}
            </span>
          )}
        </div>
      </Link>

      {onToggleFavorite && (
        <button
          onClick={() => onToggleFavorite(listing.id)}
          className="absolute top-2 right-2 bg-white/90 dark:bg-black/60 rounded-full p-1.5 hover:scale-110 transition"
          aria-label={t("marketplace.favorite")}
        >
          <Heart
            className={`w-4 h-4 ${favorited ? "fill-zrp-red text-zrp-red" : "text-gray-500"}`}
          />
        </button>
      )}

      <div className="p-3">
        <p className="text-[11px] uppercase tracking-wide text-zrp-red font-semibold">
          {t(meta.labelKey)}
        </p>
        <Link href={`/marketplace/listing/${listing.id}`}>
          <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-1 mt-0.5">
            {listing.title}
          </h3>
        </Link>
        <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">
          {formatListingPrice(listing, t("marketplace.priceOnRequest"), locale)}
        </p>
        <div className="flex items-center justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
          {listing.location ? (
            <span className="flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              {listing.location}
            </span>
          ) : (
            <span />
          )}
          {listing.seller && (
            <span className="flex items-center gap-1 flex-shrink-0">
              @{listing.seller.username}
              {listing.seller.badgeType && <VerifiedBadge badgeType={listing.seller.badgeType} />}
            </span>
          )}
        </div>
        {typeof listing.views === "number" && (
          <p className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500 mt-1">
            <Eye className="w-3 h-3" />
            {t("marketplace.viewsCount", { n: listing.views })}
          </p>
        )}
      </div>
    </div>
  );
}
