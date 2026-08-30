"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Heart,
  MapPin,
  Eye,
  Share2,
  Flag,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import VerifiedBadge from "@/components/VerifiedBadge";
import ReportModal from "@/components/ReportModal";
import {
  CATEGORY_META,
  formatListingPrice,
  type ListingCategory,
  type ListingSeller,
} from "@/lib/marketplace";

interface ListingDetail {
  id: string;
  category: ListingCategory;
  title: string;
  description: string;
  price: number | null;
  currency: string;
  priceOnRequest: boolean;
  location: string | null;
  imageUrls: string[];
  videoUrl: string | null;
  views: number;
  createdAt: string;
  seller: ListingSeller;
  favorited: boolean;
  _count: { favorites: number };
}

const LOCALE_MAP: Record<string, string> = {
  en: "en-US", fr: "fr-FR", de: "de-DE", it: "it-IT", sq: "sq-AL",
  es: "es-ES", ru: "ru-RU", ar: "ar-SA", zh: "zh-CN", tr: "tr-TR", id: "id-ID",
};

export default function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, language } = useLanguage();
  const { data: session } = useSession();
  const router = useRouter();
  const locale = LOCALE_MAP[language] || "en-US";

  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [favorited, setFavorited] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  useEffect(() => {
    fetch(`/api/listings/${id}`)
      .then(async (res) => {
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        const data = await res.json();
        setListing(data);
        setFavorited(data.favorited);
      })
      .catch((err) => {
        console.error("Error loading listing:", err);
        setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const toggleFavorite = async () => {
    if (!session?.user) {
      router.push("/login");
      return;
    }
    const prev = favorited;
    setFavorited(!prev);
    try {
      const res = await fetch(`/api/listings/${id}/favorite`, { method: "POST" });
      if (!res.ok) setFavorited(prev);
    } catch {
      setFavorited(prev);
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/marketplace/listing/${id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: listing?.title, url });
      } catch {
        // user cancelled - no-op
      }
    } else {
      await navigator.clipboard.writeText(url);
      alert(t("marketplace.linkCopied"));
    }
  };

  const handleReport = async (reason: string, details?: string) => {
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: id, reason, details }),
      });
      if (res.ok) {
        alert(t("marketplace.reportSubmitted"));
        setShowReportModal(false);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || t("marketplace.reportFailed"));
        if (res.status === 409) setShowReportModal(false);
      }
    } catch (error) {
      console.error("Error reporting listing:", error);
      alert(t("marketplace.reportFailed"));
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="w-8 h-8 border-4 border-zrp-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !listing) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <p className="text-gray-500 dark:text-gray-400">{t("marketplace.listingNotFound")}</p>
        <Link href="/marketplace" className="text-zrp-red font-medium mt-4 inline-block">
          {t("marketplace.backToMarketplace")}
        </Link>
      </div>
    );
  }

  const meta = CATEGORY_META[listing.category];
  const isOwner = session?.user?.id === listing.seller.id;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="grid md:grid-cols-5 gap-6">
        {/* Media */}
        <div className="md:col-span-3">
          <div className="relative aspect-[4/3] bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden">
            {listing.imageUrls.length > 0 ? (
              <img
                src={listing.imageUrls[activeImage]}
                alt={listing.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                <meta.icon className="w-16 h-16" />
              </div>
            )}
            {listing.imageUrls.length > 1 && (
              <>
                <button
                  onClick={() => setActiveImage((i) => (i === 0 ? listing.imageUrls.length - 1 : i - 1))}
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-1.5 hover:bg-black/70 transition"
                  aria-label={t("marketplace.previousImage")}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setActiveImage((i) => (i === listing.imageUrls.length - 1 ? 0 : i + 1))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-1.5 hover:bg-black/70 transition"
                  aria-label={t("marketplace.nextImage")}
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
          {listing.imageUrls.length > 1 && (
            <div className="flex gap-2 mt-2 overflow-x-auto">
              {listing.imageUrls.map((url, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImage(i)}
                  className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 ${
                    i === activeImage ? "border-zrp-red" : "border-transparent"
                  }`}
                >
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
          {listing.videoUrl && (
            <video src={listing.videoUrl} controls className="w-full rounded-xl mt-3 max-h-80" />
          )}

          <div className="mt-6">
            <h2 className="font-bold text-gray-900 dark:text-white mb-2">
              {t("marketplace.description")}
            </h2>
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {listing.description}
            </p>
          </div>
        </div>

        {/* Details / seller / actions */}
        <div className="md:col-span-2">
          <p className="text-xs uppercase tracking-wide text-zrp-red font-semibold">
            {t(meta.labelKey)}
          </p>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{listing.title}</h1>
          <p className="text-3xl font-extrabold text-gray-900 dark:text-white mt-2">
            {formatListingPrice(listing, t("marketplace.priceOnRequest"), locale)}
          </p>

          <div className="flex items-center gap-4 mt-3 text-sm text-gray-500 dark:text-gray-400">
            {listing.location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {listing.location}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Eye className="w-4 h-4" />
              {t("marketplace.viewsCount", { n: listing.views })}
            </span>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={toggleFavorite}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm font-medium transition ${
                favorited
                  ? "bg-zrp-red/10 border-zrp-red text-zrp-red"
                  : "border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              <Heart className={`w-4 h-4 ${favorited ? "fill-zrp-red" : ""}`} />
              {t(favorited ? "marketplace.favorited" : "marketplace.favorite")}
              {" · "}
              {listing._count.favorites}
            </button>
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition"
            >
              <Share2 className="w-4 h-4" />
              {t("marketplace.share")}
            </button>
            {!isOwner && (
              <button
                onClick={() => setShowReportModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                <Flag className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Seller card */}
          <div className="mt-6 p-4 bg-white dark:bg-zrp-deepBlack border border-gray-200 dark:border-gray-700 rounded-xl">
            <Link href={`/profile/${listing.seller.username}`} className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0">
                {listing.seller.avatarUrl && (
                  <img src={listing.seller.avatarUrl} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-gray-900 dark:text-white truncate">
                    {listing.seller.name || listing.seller.username}
                  </span>
                  {listing.seller.badgeType && <VerifiedBadge badgeType={listing.seller.badgeType} />}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">@{listing.seller.username}</p>
              </div>
            </Link>
            {listing.seller.badgeType && (
              <p className="flex items-center gap-1.5 mt-3 text-xs text-green-700 dark:text-green-400">
                <ShieldCheck className="w-4 h-4" />
                {t("marketplace.verifiedSeller")}
              </p>
            )}
            <Link
              href={`/trust/${listing.seller.username}`}
              className="text-xs text-zrp-red hover:underline mt-1 inline-block"
            >
              {t("marketplace.viewTrustPassport")}
            </Link>

            {!isOwner && (
              <Link
                href={`/messages/${listing.seller.username}?listing=${listing.id}`}
                className="mt-4 flex items-center justify-center gap-2 w-full bg-zrp-red text-white py-2.5 rounded-lg font-semibold hover:bg-red-600 transition"
              >
                <MessageCircle className="w-4 h-4" />
                {t("marketplace.contactSeller")}
              </Link>
            )}
            {isOwner && (
              <Link
                href={`/marketplace/edit/${listing.id}`}
                className="mt-4 flex items-center justify-center gap-2 w-full border border-zrp-red text-zrp-red py-2.5 rounded-lg font-semibold hover:bg-zrp-red/10 transition"
              >
                {t("marketplace.editListing")}
              </Link>
            )}
          </div>

          <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
            {t("marketplace.safetyTip")}
          </p>
        </div>
      </div>

      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSubmit={handleReport}
      />
    </div>
  );
}
