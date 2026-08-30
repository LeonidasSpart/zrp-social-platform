"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useLanguage } from "@/contexts/LanguageContext";
import ListingCard from "@/components/ListingCard";
import type { ListingSummary } from "@/lib/marketplace";

export default function MarketplaceFavoritesPage() {
  const { t } = useLanguage();
  const { status } = useSession();
  const router = useRouter();

  const [listings, setListings] = useState<ListingSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/listings/favorites")
      .then((res) => res.json())
      .then((data) => setListings(data.listings || []))
      .catch((err) => console.error("Error loading favorite listings:", err))
      .finally(() => setLoading(false));
  }, [status]);

  const removeFavorite = async (listingId: string) => {
    setListings((prev) => prev.filter((l) => l.id !== listingId));
    try {
      await fetch(`/api/listings/${listingId}/favorite`, { method: "POST" });
    } catch (error) {
      console.error("Error removing favorite:", error);
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
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
        {t("marketplace.favorites")}
      </h1>
      {listings.length === 0 ? (
        <p className="text-center py-16 text-gray-500 dark:text-gray-400">
          {t("marketplace.noFavoritesYet")}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {listings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              favorited
              onToggleFavorite={removeFavorite}
            />
          ))}
        </div>
      )}
    </div>
  );
}
