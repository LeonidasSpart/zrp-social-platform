"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import ListingCard from "@/components/ListingCard";
import { CATEGORY_META, LISTING_CATEGORIES, type ListingCategory, type ListingSummary } from "@/lib/marketplace";

interface MarketplaceBrowseProps {
  fixedCategory?: ListingCategory;
}

export default function MarketplaceBrowse({ fixedCategory }: MarketplaceBrowseProps) {
  const { t } = useLanguage();
  const searchParams = useSearchParams();

  const [listings, setListings] = useState<ListingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [category, setCategory] = useState<ListingCategory | "">(fixedCategory || "");
  const [location, setLocation] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState("newest");

  const buildQuery = useCallback(
    (cursor?: string | null) => {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      if (search.trim()) params.set("search", search.trim());
      if (location.trim()) params.set("location", location.trim());
      if (minPrice) params.set("minPrice", minPrice);
      if (maxPrice) params.set("maxPrice", maxPrice);
      if (sort) params.set("sort", sort);
      if (cursor) params.set("cursor", cursor);
      return params.toString();
    },
    [category, search, location, minPrice, maxPrice, sort]
  );

  const fetchListings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/listings?${buildQuery()}`);
      const data = await res.json();
      setListings(data.listings || []);
      setNextCursor(data.nextCursor || null);
    } catch (error) {
      console.error("Error fetching listings:", error);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    fetchListings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, sort]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/listings?${buildQuery(nextCursor)}`);
      const data = await res.json();
      setListings((prev) => [...prev, ...(data.listings || [])]);
      setNextCursor(data.nextCursor || null);
    } catch (error) {
      console.error("Error loading more listings:", error);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {fixedCategory ? t(CATEGORY_META[fixedCategory].labelKey) : t("marketplace.searchResults")}
        </h1>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition"
        >
          <SlidersHorizontal className="w-4 h-4" />
          {t("marketplace.filters")}
        </button>
      </div>

      {showFilters && (
        <div className="bg-white dark:bg-zrp-deepBlack border border-gray-200 dark:border-gray-700 rounded-xl p-4 mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("marketplace.searchPlaceholder")}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm"
          />
          {!fixedCategory && (
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ListingCategory | "")}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm"
            >
              <option value="">{t("marketplace.allCategories")}</option>
              {LISTING_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(CATEGORY_META[c].labelKey)}
                </option>
              ))}
            </select>
          )}
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={t("marketplace.locationPlaceholder")}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm"
          />
          <input
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            type="number"
            placeholder={t("marketplace.minPrice")}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm"
          />
          <input
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            type="number"
            placeholder={t("marketplace.maxPrice")}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm"
          />
          <div className="sm:col-span-2 lg:col-span-5 flex gap-2 justify-end">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm"
            >
              <option value="newest">{t("marketplace.sortNewest")}</option>
              <option value="priceLow">{t("marketplace.sortPriceLow")}</option>
              <option value="priceHigh">{t("marketplace.sortPriceHigh")}</option>
            </select>
            <button
              onClick={fetchListings}
              className="px-4 py-2 bg-zrp-red text-white rounded-lg text-sm font-medium hover:bg-red-600 transition"
            >
              {t("marketplace.applyFilters")}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-zrp-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : listings.length === 0 ? (
        <p className="text-center py-16 text-gray-500 dark:text-gray-400">
          {t("marketplace.noListingsFound")}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
          {nextCursor && (
            <div className="flex justify-center mt-8">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-full text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition"
              >
                {loadingMore ? t("feed.loadingMore") : t("feed.loadMore")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
