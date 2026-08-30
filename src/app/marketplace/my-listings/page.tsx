"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Plus, Pencil, Trash2, Eye, Heart } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  CATEGORY_META,
  STATUS_LABEL_KEYS,
  STATUS_STYLES,
  formatListingPrice,
  type ListingSummary,
} from "@/lib/marketplace";

const LOCALE_MAP: Record<string, string> = {
  en: "en-US", fr: "fr-FR", de: "de-DE", it: "it-IT", sq: "sq-AL",
  es: "es-ES", ru: "ru-RU", ar: "ar-SA", zh: "zh-CN", tr: "tr-TR", id: "id-ID",
};

export default function MyListingsPage() {
  const { t, language } = useLanguage();
  const { status } = useSession();
  const router = useRouter();
  const locale = LOCALE_MAP[language] || "en-US";

  const [listings, setListings] = useState<ListingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const load = () => {
    setLoading(true);
    fetch("/api/listings/mine")
      .then((res) => res.json())
      .then((data) => setListings(data.listings || []))
      .catch((err) => console.error("Error loading your listings:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (status === "authenticated") load();
  }, [status]);

  const handleDelete = async (id: string) => {
    if (!confirm(t("marketplace.confirmDelete"))) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/listings/${id}`, { method: "DELETE" });
      if (res.ok) {
        setListings((prev) => prev.filter((l) => l.id !== id));
      } else {
        alert(t("marketplace.errDeleteFailed"));
      }
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="w-8 h-8 border-4 border-zrp-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t("marketplace.myListings")}
        </h1>
        <Link
          href="/marketplace/new"
          className="flex items-center gap-1.5 px-4 py-2 bg-zrp-red text-white rounded-lg font-medium hover:bg-red-600 transition text-sm"
        >
          <Plus className="w-4 h-4" />
          {t("marketplace.createListing")}
        </Link>
      </div>

      {listings.length === 0 ? (
        <p className="text-center py-16 text-gray-500 dark:text-gray-400">
          {t("marketplace.noOwnListings")}
        </p>
      ) : (
        <div className="space-y-3">
          {listings.map((listing) => {
            const meta = CATEGORY_META[listing.category];
            return (
              <div
                key={listing.id}
                className="flex flex-col sm:flex-row gap-3 bg-white dark:bg-zrp-deepBlack border border-gray-200 dark:border-gray-700 rounded-xl p-4"
              >
                <Link
                  href={`/marketplace/listing/${listing.id}`}
                  className="w-full sm:w-28 h-28 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800"
                >
                  {listing.imageUrls[0] ? (
                    <img src={listing.imageUrls[0]} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <meta.icon className="w-8 h-8" />
                    </div>
                  )}
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {listing.status && (
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_STYLES[listing.status]}`}
                      >
                        {t(STATUS_LABEL_KEYS[listing.status])}
                      </span>
                    )}
                    <span className="text-[11px] uppercase text-zrp-red font-semibold">
                      {t(meta.labelKey)}
                    </span>
                  </div>
                  <Link href={`/marketplace/listing/${listing.id}`}>
                    <h3 className="font-semibold text-gray-900 dark:text-white mt-1 line-clamp-1">
                      {listing.title}
                    </h3>
                  </Link>
                  <p className="font-bold text-gray-900 dark:text-white">
                    {formatListingPrice(listing, t("marketplace.priceOnRequest"), locale)}
                  </p>
                  {listing.status === "REJECTED" && listing.rejectionReason && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                      {t("marketplace.rejectionReasonLabel")}: {listing.rejectionReason}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      {listing.views ?? 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <Heart className="w-3 h-3" />
                      {listing._count?.favorites ?? 0}
                    </span>
                  </div>
                </div>
                <div className="flex sm:flex-col gap-2 flex-shrink-0">
                  <Link
                    href={`/marketplace/edit/${listing.id}`}
                    className="flex items-center justify-center gap-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    {t("marketplace.edit")}
                  </Link>
                  <button
                    onClick={() => handleDelete(listing.id)}
                    disabled={deletingId === listing.id}
                    className="flex items-center justify-center gap-1 px-3 py-1.5 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg text-sm hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {t("marketplace.delete")}
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
