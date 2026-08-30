"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Plus, Heart, LayoutList, Search as SearchIcon } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import ListingCard from "@/components/ListingCard";
import { CATEGORY_META, LISTING_CATEGORIES, type ListingSummary } from "@/lib/marketplace";

export default function MarketplaceHomePage() {
  const { t } = useLanguage();
  const { data: session } = useSession();
  const [listings, setListings] = useState<ListingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/listings?limit=12")
      .then((res) => res.json())
      .then((data) => setListings(data.listings || []))
      .catch((err) => console.error("Error loading marketplace listings:", err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack rounded-2xl px-6 py-12 text-center mb-8">
        <h1 className="text-3xl sm:text-4xl font-extrabold font-orbitron text-white">
          {t("marketplace.heroTitle")}
        </h1>
        <p className="mt-3 text-white/80 max-w-xl mx-auto">{t("marketplace.heroSubtitle")}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            window.location.href = `/marketplace/search?q=${encodeURIComponent(search)}`;
          }}
          className="mt-6 max-w-lg mx-auto flex gap-2"
        >
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("marketplace.searchPlaceholder")}
              className="w-full pl-9 pr-3 py-2.5 rounded-full bg-white/95 text-gray-900 focus:outline-none focus:ring-2 focus:ring-zrp-red"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 bg-zrp-red text-white rounded-full font-semibold hover:bg-red-600 transition"
          >
            {t("marketplace.search")}
          </button>
        </form>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {session?.user && (
            <Link
              href="/marketplace/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white text-zrp-darkRed rounded-full font-semibold hover:bg-gray-100 transition text-sm"
            >
              <Plus className="w-4 h-4" />
              {t("marketplace.createListing")}
            </Link>
          )}
          {session?.user && (
            <Link
              href="/marketplace/my-listings"
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-white/40 text-white rounded-full font-semibold hover:bg-white/10 transition text-sm"
            >
              <LayoutList className="w-4 h-4" />
              {t("marketplace.myListings")}
            </Link>
          )}
          {session?.user && (
            <Link
              href="/marketplace/favorites"
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-white/40 text-white rounded-full font-semibold hover:bg-white/10 transition text-sm"
            >
              <Heart className="w-4 h-4" />
              {t("marketplace.favorites")}
            </Link>
          )}
        </div>
      </section>

      {/* Categories */}
      <section className="mb-10">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
          {t("marketplace.browseCategories")}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {LISTING_CATEGORIES.map((category) => {
            const meta = CATEGORY_META[category];
            return (
              <Link
                key={category}
                href={`/marketplace/category/${category}`}
                className="flex flex-col items-center gap-2 p-4 bg-white dark:bg-zrp-deepBlack rounded-xl border border-gray-200 dark:border-gray-700 hover:border-zrp-red hover:shadow-md transition text-center"
              >
                <meta.icon className="w-7 h-7 text-zrp-red" />
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  {t(meta.labelKey)}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Recent listings */}
      <section>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
          {t("marketplace.recentListings")}
        </h2>
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-zrp-red border-t-transparent rounded-full animate-spin" />
          </div>
        ) : listings.length === 0 ? (
          <p className="text-center py-16 text-gray-500 dark:text-gray-400">
            {t("marketplace.noListingsYet")}
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
