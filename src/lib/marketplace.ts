import { Car, Sailboat, Plane, Building2, Home, Watch, Gem } from "lucide-react";
import type { TranslationKey } from "@/lib/translations";

export const LISTING_CATEGORIES = [
  "LUXURY_CARS",
  "YACHTS_BOATS",
  "PRIVATE_AIRCRAFT",
  "LUXURY_HOTELS_RESORTS",
  "LUXURY_REAL_ESTATE",
  "WATCHES_JEWELRY",
  "OTHER_LUXURY",
] as const;

export type ListingCategory = (typeof LISTING_CATEGORIES)[number];

export const CATEGORY_META: Record<
  ListingCategory,
  { icon: typeof Car; labelKey: TranslationKey }
> = {
  LUXURY_CARS: { icon: Car, labelKey: "marketplace.categoryLuxuryCars" },
  YACHTS_BOATS: { icon: Sailboat, labelKey: "marketplace.categoryYachtsBoats" },
  PRIVATE_AIRCRAFT: { icon: Plane, labelKey: "marketplace.categoryPrivateAircraft" },
  LUXURY_HOTELS_RESORTS: { icon: Building2, labelKey: "marketplace.categoryLuxuryHotelsResorts" },
  LUXURY_REAL_ESTATE: { icon: Home, labelKey: "marketplace.categoryLuxuryRealEstate" },
  WATCHES_JEWELRY: { icon: Watch, labelKey: "marketplace.categoryWatchesJewelry" },
  OTHER_LUXURY: { icon: Gem, labelKey: "marketplace.categoryOtherLuxury" },
};

export const LISTING_STATUSES = [
  "DRAFT",
  "PENDING_REVIEW",
  "ACTIVE",
  "REJECTED",
  "SOLD",
  "EXPIRED",
  "REMOVED",
] as const;

export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const STATUS_LABEL_KEYS: Record<ListingStatus, TranslationKey> = {
  DRAFT: "marketplace.statusDraft",
  PENDING_REVIEW: "marketplace.statusPendingReview",
  ACTIVE: "marketplace.statusActive",
  REJECTED: "marketplace.statusRejected",
  SOLD: "marketplace.statusSold",
  EXPIRED: "marketplace.statusExpired",
  REMOVED: "marketplace.statusRemoved",
};

export const STATUS_STYLES: Record<ListingStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  PENDING_REVIEW: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  SOLD: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  EXPIRED: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
  REMOVED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export interface ListingSeller {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  badgeType: string | null;
  bio?: string | null;
  createdAt?: string;
}

export interface ListingSummary {
  id: string;
  category: ListingCategory;
  title: string;
  price: number | null;
  currency: string;
  priceOnRequest: boolean;
  location: string | null;
  imageUrls: string[];
  videoUrl: string | null;
  views?: number;
  status?: ListingStatus;
  rejectionReason?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  seller?: ListingSeller;
  _count?: { favorites: number };
}

export function formatListingPrice(
  listing: Pick<ListingSummary, "price" | "currency" | "priceOnRequest">,
  priceOnRequestLabel: string,
  locale: string
): string {
  if (listing.priceOnRequest || listing.price === null) return priceOnRequestLabel;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: listing.currency || "USD",
      maximumFractionDigits: 0,
    }).format(listing.price);
  } catch {
    return `${listing.currency} ${listing.price.toLocaleString(locale)}`;
  }
}
